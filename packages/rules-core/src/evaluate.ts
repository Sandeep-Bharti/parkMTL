import {
  type Assessment,
  type Clause,
  type ExemptionKind,
  type LocalTime,
  type MonthDay,
  type Rule,
  type Season,
  type Status,
  type TimeRange,
  compareStatus,
  mostRestrictive,
} from './types.ts';

/**
 * Constructing an `Intl.DateTimeFormat` is expensive — far more so than using
 * one. `assess` probes minute by minute across a 48h horizon, so a formatter
 * built per call meant ~2,881 of them per assessment: tens of milliseconds on
 * V8 and hundreds on Hermes, for one tap. There are only ever a handful of
 * distinct time zones, so they are built once and kept.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false,
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Convert an instant to wall-clock time in `timeZone`, DST included.
 *
 * Uses Intl rather than date arithmetic so that the twice-yearly Montreal DST
 * shift lands on the correct local hour without a tz database dependency.
 */
export function toLocal(date: Date, timeZone: string): LocalTime {
  const parts = formatterFor(timeZone).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Intl renders midnight as hour 24 in some ICU versions; normalise to 0.
  const hour = Number(get('hour')) % 24;

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdays.indexOf(get('weekday')),
    minutes: hour * 60 + Number(get('minute')),
  };
}

function monthDayIndex(md: MonthDay): number {
  return md.month * 100 + md.day;
}

/** Inclusive on both ends; handles windows that wrap the new year. */
export function inSeason(season: Season, t: LocalTime): boolean {
  const now = t.month * 100 + t.day;
  const from = monthDayIndex(season.from);
  const to = monthDayIndex(season.to);
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

/**
 * A range whose end is at or before its start runs past midnight.
 *
 * The equality case carries real weight: Montreal's paid feed encodes an
 * all-day regulation as `00:00–00:00`, which lands here as a wrap covering the
 * full 24 hours. That is the intended reading — reserved accessible and
 * EV-charging bays are reserved around the clock — but it is load-bearing
 * enough to say out loud, since `>` instead of `>=` would silently turn those
 * spaces into unrestricted parking.
 */
function crossesMidnight(range: TimeRange): boolean {
  return range.end <= range.start;
}

/**
 * Whether a clause is in force.
 *
 * For a range that crosses midnight the weekday named on the sign is the day
 * the restriction *starts*: `\P 19h-7h LUN` covers Monday evening through
 * Tuesday morning. So the early-morning tail is matched against the previous
 * day's weekday, not the current one.
 */
export function clauseActiveAt(clause: Clause, t: LocalTime): boolean {
  const everyDay = clause.weekdays.length === 0;
  const today = everyDay || clause.weekdays.includes(t.weekday);
  const yesterday =
    everyDay || clause.weekdays.includes((t.weekday + 6) % 7);

  if (clause.times.length === 0) return today;

  return clause.times.some((range) => {
    if (!crossesMidnight(range)) {
      return today && t.minutes >= range.start && t.minutes < range.end;
    }
    return (
      (today && t.minutes >= range.start) ||
      (yesterday && t.minutes < range.end)
    );
  });
}

export function ruleActiveAt(rule: Rule, t: LocalTime): boolean {
  if (rule.action === 'informational') return false;
  if (rule.season && !inSeason(rule.season, t)) return false;
  if (rule.clauses.length === 0) return true; // e.g. "EN TOUT TEMPS"
  return rule.clauses.some((c) => clauseActiveAt(c, t));
}

/**
 * Exemptions that reserve a space *for* someone rather than forbidding it to
 * everyone. Whoever holds the permit may park; everyone else may not.
 */
const RESERVED_FOR: ReadonlySet<ExemptionKind> = new Set<ExemptionKind>([
  'permit_resident',
  'disabled',
  'ev_charging',
]);

/**
 * Status this rule imposes on a driver holding no permit, while it is active.
 * Returns null for rules that impose nothing.
 */
export function ruleStatus(rule: Rule): Status | null {
  // `\P AUX CAMIONS` restricts trucks only and says nothing to a car driver.
  if (rule.appliesToVehicle && rule.appliesToVehicle !== 'bicycle') return null;

  switch (rule.action) {
    case 'no_standing':
      return 'no_standing';
    case 'no_parking':
      // A restriction that names who *may* park is not a blanket prohibition.
      // `\P EXCEPTE S3R` is the common residential case, and Montreal's paid
      // feed encodes reserved accessible and EV-charging bays the same way.
      // Calling these `permit_only` rather than `no_parking` is both more
      // accurate and more useful: it tells the driver who holds the permit —
      // or is charging — that the space is in fact theirs, while still keeping
      // everyone else out of it.
      return rule.exemptions.some((e) => RESERVED_FOR.has(e.kind))
        ? 'permit_only'
        : 'no_parking';
    case 'parking_allowed':
      return rule.maxDurationMin != null ? 'limited' : 'free';
    case 'informational':
      return null;
  }
}

export interface AssessOptions {
  timeZone: string;
  /** How far ahead to look for the next status change. Default 48h. */
  horizonMinutes?: number;
  /** True when the location is a paid space and currently within a tariff period. */
  paid?: boolean;
}

function statusAt(rules: Rule[], t: LocalTime, paid: boolean): Status {
  // A rule we could not parse means we do not know its window, so we cannot
  // claim the spot is clear. Fail loud rather than confidently wrong.
  if (rules.some((r) => r.confidence === 'none' && r.action !== 'informational')) {
    return 'unknown';
  }

  let worst: Status = paid ? 'paid' : 'free';
  for (const rule of rules) {
    if (!ruleActiveAt(rule, t)) continue;
    const s = ruleStatus(rule);
    if (s && compareStatus(s, worst) > 0) worst = s;
  }
  return worst;
}

/**
 * Combine every sign on a pole into a single verdict, plus when it changes.
 *
 * The forward scan samples minute by minute rather than solving for schedule
 * boundaries analytically. With a 48h horizon that is ~2,880 cheap evaluations
 * for one tapped feature — far too little to notice, and it cannot get the
 * midnight/DST/season edge cases wrong the way boundary arithmetic does.
 */
export function assess(
  rules: Rule[],
  at: Date,
  opts: AssessOptions,
): Assessment {
  const { timeZone, horizonMinutes = 48 * 60, paid = false } = opts;

  const now = toLocal(at, timeZone);
  const status = statusAt(rules, now, paid);

  const active = rules
    .filter((r) => ruleActiveAt(r, now))
    .sort((a, b) => {
      const sa = ruleStatus(a);
      const sb = ruleStatus(b);
      if (!sa || !sb) return 0;
      return compareStatus(sb, sa);
    });

  let until: Date | null = null;
  let next: Status | null = null;
  for (let step = 1; step <= horizonMinutes; step++) {
    const probe = new Date(at.getTime() + step * 60_000);
    const s = statusAt(rules, toLocal(probe, timeZone), paid);
    if (s !== status) {
      // Round down to the minute so the UI shows "8:30", never "8:30:47".
      probe.setSeconds(0, 0);
      until = probe;
      next = s;
      break;
    }
  }

  return {
    status,
    active,
    until,
    next,
    needsVerification: rules.some(
      (r) => r.confidence !== 'full' && r.action !== 'informational',
    ),
  };
}

/**
 * Status for every rule in the dictionary at one instant.
 *
 * This is what drives map colouring: the whole city's ~1,500 distinct rules
 * resolve in one pass, and the result becomes a MapLibre `match` expression
 * keyed on each feature's `ruleId`. No per-feature work on the JS side.
 */
export function statusByRuleId(
  rules: Rule[],
  at: Date,
  timeZone: string,
): Map<number, Status> {
  const t = toLocal(at, timeZone);
  const out = new Map<number, Status>();
  for (const rule of rules) {
    if (rule.action === 'informational') continue;
    if (rule.confidence === 'none') {
      out.set(rule.id, 'unknown');
      continue;
    }
    out.set(rule.id, ruleActiveAt(rule, t) ? (ruleStatus(rule) ?? 'free') : 'free');
  }
  return out;
}

/**
 * A set of rules that govern one feature together, named by a single integer.
 *
 * A paid bay can carry sixteen regulations at once, and a map `match`
 * expression cannot evaluate a list. Distinct *combinations* are few — about
 * 1,250 across Montreal — so each gets an id, and the feature carries that one
 * number instead.
 */
export interface RuleCombo {
  id: number;
  ruleIds: number[];
}

/**
 * Fold per-rule statuses into per-combination statuses.
 *
 * Runs immediately after `statusByRuleId` and is the same shape of operation:
 * a few thousand map lookups, no per-feature work. A combination resolves to
 * its most restrictive member, so a bay that is free under one regulation and
 * towed under another reads as towed.
 */
export function statusByComboId(
  statusByRule: Map<number, Status>,
  combos: RuleCombo[],
): Map<number, Status> {
  const out = new Map<number, Status>();
  for (const combo of combos) {
    const statuses: Status[] = [];
    for (const ruleId of combo.ruleIds) {
      // A rule absent from the map is informational — it says nothing about
      // whether you may park, so it must not drag the combination anywhere.
      const status = statusByRule.get(ruleId);
      if (status !== undefined) statuses.push(status);
    }
    out.set(combo.id, statuses.length > 0 ? mostRestrictive(statuses) : 'unknown');
  }
  return out;
}
