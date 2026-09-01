import {
  type Assessment,
  type Clause,
  type LocalTime,
  type MonthDay,
  type Rule,
  type Season,
  type Status,
  type TimeRange,
  compareStatus,
} from './types.ts';

/**
 * Convert an instant to wall-clock time in `timeZone`, DST included.
 *
 * Uses Intl rather than date arithmetic so that the twice-yearly Montreal DST
 * shift lands on the correct local hour without a tz database dependency.
 */
export function toLocal(date: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

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
      // `\P EXCEPTE S3R` is the common residential case. Calling it
      // `permit_only` rather than `no_parking` is both more accurate and more
      // useful — it tells a permit holder they may in fact park.
      return rule.exemptions.some((e) => e.kind === 'permit_resident')
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
