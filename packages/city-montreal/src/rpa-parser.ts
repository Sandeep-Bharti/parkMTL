/**
 * Parser for Ville de Montréal `DESCRIPTION_RPA` sign text.
 *
 * The whole city reduces to ~1,525 distinct strings (144k signs), so this runs
 * once at build time over the corpus and emits a rule dictionary. It never runs
 * on device. That means a mis-parse is fixable by republishing data, without an
 * app release — and it is why the coverage harness (`scripts/ingest/parse-rules.ts`)
 * gates CI rather than a runtime fallback.
 *
 * Grammar, as observed across the corpus:
 *
 *   [\P | \A | P] [duration] [time range]* [weekdays] [ET [time range]* [weekdays]]*
 *                 [season] [EXCEPTE exemption]*
 */

import type {
  Clause,
  Confidence,
  Exemption,
  ExemptionKind,
  Rule,
  Season,
  SignAction,
  TimeRange,
  VehicleClass,
} from '../../rules-core/src/types.ts';

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Parentheticals that carry no rule meaning; dropped before unwrapping the rest. */
const NOISE_PARENTHETICALS = [
  /\(\s*\d+\s*[xX]\s*\d+\s*\)/g, // sign dimensions, e.g. (300 x 450)
  /\(\s*micro\s*\/\s*original\s*\)/gi,
  /\(\s*flexible\s*\)/gi,
  /\(\s*orange\s*\)/gi,
  /\(\s*picto\w*\s*\)/gi,
  /\(\s*gr\.?\s*r\s*\)/gi,
  /\(\s*\d+\s*secteurs?\s*\)/gi,
];

export function normalize(raw: string): string {
  let s = raw;

  for (const pattern of NOISE_PARENTHETICALS) s = s.replace(pattern, ' ');

  s = s
    .toUpperCase()
    // Strip diacritics so EXCEPTÉ/EXCEPTE and FÉVRIER/FEVRIER unify.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Backtick and typographic apostrophes appear in "JOURS D`ECOLE".
    .replace(/[`'’]/g, "'")
    // Leading action marker: collapse doubled or lowercased backslashes.
    .replace(/\\+/g, '\\')
    // Remaining parentheses are unwrapped, not dropped: "(EN TOUT TEMPS)" is
    // load-bearing.
    .replace(/[()]/g, ' ')
    // Range separators used interchangeably across boroughs.
    .replace(/[–—]/g, '-')
    .replace(/\s*@\s*/g, ' - ')
    .replace(/\bHRS?\b/g, 'H')
    .replace(/\s+/g, ' ')
    .trim();

  // "9-23h" is shorthand for "9h-23h"; give the first number its H so the time
  // tokeniser sees a normal pair.
  s = s.replace(/\b(\d{1,2})\s*-\s*(\d{1,2})\s*H\b/g, '$1H-$2H');

  return s;
}

// ---------------------------------------------------------------------------
// Exemptions
// ---------------------------------------------------------------------------

interface ExemptionPattern {
  kind: ExemptionKind;
  pattern: RegExp;
}

const EXEMPTION_PATTERNS: ExemptionPattern[] = [
  { kind: 'permit_resident', pattern: /\bS3R\b/g },
  {
    kind: 'permit_resident',
    pattern:
      /\b(?:TITULAIRES?|DETENTEURS?)\s+DE\s+PERMIS(?:\s+SECTEUR\s+\S+)?/g,
  },
  { kind: 'permit_resident', pattern: /\bPERMIS\s+SECTEUR\s+\S+/g },
  { kind: 'permit_resident', pattern: /\bRESIDENTS?\b/g },
  { kind: 'disabled', pattern: /\bHANDICAPE[ES]*\b/g },
  {
    kind: 'ev_charging',
    pattern: /\bVOITURES?\s+ELECTRIQUES?(?:\s*-?\s*EN\s+RECHARGE)?\b|\b(?:ELECTRIQUES?|RECHARGE)\b/g,
  },
  { kind: 'taxi', pattern: /\bTAXIS?\b/g },
  { kind: 'bus', pattern: /\b(?:AUTOBUS|STM)\b/g },
  { kind: 'school_bus', pattern: /\b(?:SCOLAIRES?|ECOLIERS?)\b/g },
  { kind: 'delivery', pattern: /\b(?:LIVRAISONS?|DEBARCADERES?)\b/g },
  { kind: 'carshare', pattern: /\b(?:COMMUNAUTO|AUTOPARTAGE)\b/g },
  { kind: 'motorcycle', pattern: /\bMOTOS?\b/g },
  {
    kind: 'emergency',
    pattern: /\b(?:VEHICULES?\s+D'URGENCE|URGENCES?|POMPIERS?|AMBULANCES?)\b/g,
  },
  {
    kind: 'municipal',
    pattern:
      /\bVEHICULES?\s+(?:DU\s+SERVICE\s+DE\s+LA\s+POLICE|DE\s+LA\s+VILLE|MUNICIPAUX)\b|\bPOLICE\b/g,
  },
  {
    kind: 'diplomatic',
    pattern: /\bCORPS\s+CONSULAIRES?(?:\s+ET\s+DIPLOMATIQUES?)?\b|\bDIPLOMATIQUES?\b/g,
  },
  { kind: 'hotel', pattern: /\bHOTEL\b/g },
  { kind: 'daycare', pattern: /\bGARDERIES?\b/g },
  {
    kind: 'other',
    pattern: /\b(?:EMPLOYES?|VISITEURS?|USAGERS?)\b(?:\s+(?:DE\s+)?(?:L'EDIFICE|LA\s+VILLE))?/g,
  },
  { kind: 'authorized', pattern: /\bAUTORISE[ES]*\b/g },
];

/**
 * `AUX <class>` narrows a prohibition to one vehicle class. Matched before
 * exemptions so that `\P AUX AUTOBUS` is not mistaken for a bus *exemption*.
 */
const VEHICLE_TARGETS: Array<{ vehicle: VehicleClass; pattern: RegExp }> = [
  { vehicle: 'truck', pattern: /\bAUX?\s+CAMIONS?\b/ },
  { vehicle: 'trailer', pattern: /\bAUX?\s+REMORQUES?\b/ },
  { vehicle: 'motorcycle', pattern: /\bAUX?\s+MOTOS?\b/ },
  { vehicle: 'bus', pattern: /\bAUX?\s+AUTOBUS\b/ },
  { vehicle: 'bicycle', pattern: /\bAUX?\s+VELOS?\b/ },
];

function extractVehicleTarget(input: string): {
  rest: string;
  appliesToVehicle?: VehicleClass;
} {
  for (const { vehicle, pattern } of VEHICLE_TARGETS) {
    if (pattern.test(input)) {
      return {
        rest: input.replace(pattern, ' ').replace(/\s+/g, ' ').trim(),
        appliesToVehicle: vehicle,
      };
    }
  }
  return { rest: input };
}

/**
 * Where on the street the sign applies. Carries no schedule meaning, so it is
 * stripped — but it must be stripped explicitly, or `\P DEUX COTES` (1,132
 * signs) looks like an unrecognised rule rather than an unconditional one.
 */
const SPATIAL_QUALIFIERS =
  /\b(?:DES\s+)?DEUX\s+COTES\b|\bCE\s+COTE\b|\bAUTRE\s+COTE\b|\b(?:A|EN)\s+ANGLE\b|\bEN\s+EPI\b|\bPARALLELE\b/g;

/** Tokens that introduce an exemption; removed once their object is captured. */
const EXEMPTION_MARKERS = /\b(?:EXCEPTE[ES]?|SAUF|RESERVE[ES]?)\b/g;

function extractExemptions(input: string): {
  rest: string;
  exemptions: Exemption[];
} {
  let rest = input;
  const exemptions: Exemption[] = [];
  const seen = new Set<ExemptionKind>();

  for (const { kind, pattern } of EXEMPTION_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = rest.match(pattern);
    if (!matches) continue;

    if (!seen.has(kind)) {
      seen.add(kind);
      const zone = /SECTEUR\s+(\S+)/.exec(matches[0])?.[1];
      exemptions.push({ kind, raw: matches[0].trim(), ...(zone ? { zone } : {}) });
    }
    rest = rest.replace(pattern, ' ');
  }

  rest = rest.replace(EXEMPTION_MARKERS, ' ');
  return { rest: rest.replace(/\s+/g, ' ').trim(), exemptions };
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  JANVIER: 1, JANV: 1, JAN: 1,
  FEVRIER: 2, FEVR: 2, FEV: 2,
  MARS: 3,
  AVRIL: 4, AVR: 4,
  MAI: 5,
  JUIN: 6,
  JUILLET: 7, JUIL: 7,
  AOUT: 8,
  SEPTEMBRE: 9, SEPT: 9, SEP: 9,
  OCTOBRE: 10, OCT: 10,
  NOVEMBRE: 11, NOV: 11,
  DECEMBRE: 12, DEC: 12,
};

// Longest-first so AVRIL wins over AVR and SEPTEMBRE over SEPT.
const MONTH_ALTERNATION = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');

/** "1 AVRIL AU 1 DEC", "1ER AVRIL - 30 NOV", "1AVRIL AU 1DEC" */
const DATED_SEASON = new RegExp(
  `\\b(\\d{1,2})\\s*(?:ER)?\\s*(${MONTH_ALTERNATION})\\.?\\s*(?:AU|A|-)\\s*(\\d{1,2})\\s*(?:ER)?\\s*(${MONTH_ALTERNATION})\\.?`,
);

/** "SEPT. A JUIN" — month to month, no day numbers. */
const BARE_SEASON = new RegExp(
  `\\b(${MONTH_ALTERNATION})\\.?\\s*(?:AU|A|-)\\s*(${MONTH_ALTERNATION})\\.?\\b`,
);

function extractSeason(input: string): { rest: string; season?: Season } {
  const dated = DATED_SEASON.exec(input);
  if (dated) {
    return {
      rest: input.replace(dated[0], ' ').replace(/\s+/g, ' ').trim(),
      season: {
        from: { month: MONTHS[dated[2]], day: Number(dated[1]) },
        to: { month: MONTHS[dated[4]], day: Number(dated[3]) },
      },
    };
  }

  const bare = BARE_SEASON.exec(input);
  if (bare) {
    const toMonth = MONTHS[bare[2]];
    return {
      rest: input.replace(bare[0], ' ').replace(/\s+/g, ' ').trim(),
      season: {
        from: { month: MONTHS[bare[1]], day: 1 },
        // Inclusive of the whole closing month.
        to: { month: toMonth, day: daysInMonth(toMonth) },
      },
    };
  }

  return { rest: input };
}

function daysInMonth(month: number): number {
  // Non-leap reference year: seasons are recurring annual windows, and Feb 29
  // is never a boundary in this corpus.
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

// ---------------------------------------------------------------------------
// Action and duration
// ---------------------------------------------------------------------------

/**
 * An hour, with optional minutes.
 *
 * The negative lookahead is load-bearing: in `P 02H 09H-18H` a naive optional
 * `\s*(\d{2})` swallows the `09` of the next hour as the minutes of the first,
 * turning "2h cap, 9am-6pm" into "2:09am". Minutes may not be followed by `H`.
 */
const TIME_TOKEN = /\b(\d{1,2})\s*H(?:\s*(\d{2})(?!\s*H))?/g;

function countTimeTokens(s: string): number {
  TIME_TOKEN.lastIndex = 0;
  return (s.match(TIME_TOKEN) ?? []).length;
}

// `(?![A-Z])` rather than `\b`, so that run-together forms like `\P13H` (which
// appear unspaced in some boroughs) still yield their action marker.
function extractAction(input: string): { rest: string; action: SignAction } {
  if (/^\\?\s*A(?![A-Z])/.test(input)) {
    return {
      rest: input.replace(/^\\?\s*A(?![A-Z])/, ' ').trim(),
      action: 'no_standing',
    };
  }
  if (/^\\\s*P(?![A-Z])/.test(input)) {
    return {
      rest: input.replace(/^\\\s*P(?![A-Z])/, ' ').trim(),
      action: 'no_parking',
    };
  }
  if (/^P(?![A-Z])/.test(input)) {
    return {
      rest: input.replace(/^P(?![A-Z])/, ' ').trim(),
      action: 'parking_allowed',
    };
  }
  // Unprefixed forms such as "8H A 17H - LUN MER VEN" are permissive notices.
  return { rest: input, action: 'parking_allowed' };
}

/**
 * Pull a leading duration cap off a `P` sign.
 *
 * `P 15 MIN` is unambiguous. `P 2H 8H-22H` is not: is `2H` a cap or the start
 * of a range? Time tokens always pair up into ranges, so an odd count means
 * exactly one token is unpaired — the duration. This also resolves the awkward
 * `P 2H - 8H - 18H` form, where the first separator is spurious.
 */
function extractDuration(input: string): {
  rest: string;
  maxDurationMin?: number;
} {
  const minutes = /^\s*(\d{1,3})\s*MIN\b\.?/.exec(input);
  if (minutes) {
    return {
      rest: input.slice(minutes[0].length).trim(),
      maxDurationMin: Number(minutes[1]),
    };
  }

  if (countTimeTokens(input) % 2 === 1) {
    const hours = /^\s*(\d{1,2})\s*H(?:\s*(\d{2})(?!\s*H))?/.exec(input);
    if (hours) {
      return {
        rest: input.slice(hours[0].length).replace(/^\s*-\s*/, ' ').trim(),
        maxDurationMin: Number(hours[1]) * 60 + Number(hours[2] ?? 0),
      };
    }
  }

  return { rest: input };
}

// ---------------------------------------------------------------------------
// Clauses (time ranges + weekdays)
// ---------------------------------------------------------------------------

const WEEKDAYS: Record<string, number> = {
  DIMANCHE: 0, DIM: 0,
  LUNDI: 1, LUN: 1,
  MARDI: 2, MAR: 2,
  MERCREDI: 3, MER: 3,
  JEUDI: 4, JEU: 4,
  VENDREDI: 5, VEN: 5,
  SAMEDI: 6, SAM: 6,
};

const WEEKDAY_ALTERNATION = Object.keys(WEEKDAYS)
  .sort((a, b) => b.length - a.length)
  .join('|');

type Token =
  | { type: 'time'; minutes: number }
  | { type: 'day'; day: number }
  | { type: 'range' }
  | { type: 'and' }
  | { type: 'other'; text: string };

const TOKENIZER = new RegExp(
  [
    `(?<time>\\b\\d{1,2}\\s*H(?:\\s*\\d{2}(?!\\s*H))?)`,
    `(?<day>\\b(?:${WEEKDAY_ALTERNATION})\\b\\.?)`,
    `(?<range>\\b(?:AU|A)\\b|-)`,
    `(?<and>\\bET\\b|,)`,
    `(?<other>\\S+)`,
  ].join('|'),
  'g',
);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  TOKENIZER.lastIndex = 0;

  for (const match of input.matchAll(TOKENIZER)) {
    const g = match.groups!;
    if (g.time) {
      const [, h, m] = /(\d{1,2})\s*H(?:\s*(\d{2}))?/.exec(g.time)!;
      tokens.push({ type: 'time', minutes: Number(h) * 60 + Number(m || 0) });
    } else if (g.day) {
      tokens.push({ type: 'day', day: WEEKDAYS[g.day.replace('.', '')] });
    } else if (g.range) {
      tokens.push({ type: 'range' });
    } else if (g.and) {
      tokens.push({ type: 'and' });
    } else {
      tokens.push({ type: 'other', text: g.other });
    }
  }
  return tokens;
}

/** Expand `LUN A VEN` into the days it spans, wrapping across Sunday. */
function expandDayRange(from: number, to: number): number[] {
  const days: number[] = [];
  for (let d = from; ; d = (d + 1) % 7) {
    days.push(d);
    if (d === to) break;
    if (days.length > 7) break;
  }
  return days;
}

interface ClauseParse {
  clauses: Clause[];
  leftovers: string[];
}

/**
 * Walk the token stream into clauses.
 *
 * Times accumulate and pair off into ranges; weekdays attach to the times that
 * preceded them. A time token appearing *after* weekdays opens a new clause —
 * that is what splits `09H-18H LUN. MAR. SAM. 09H-21H JEU. VEN.` correctly.
 */
function parseClauses(tokens: Token[]): ClauseParse {
  const clauses: Clause[] = [];
  const leftovers: string[] = [];

  let times: number[] = [];
  let days: number[] = [];

  const flush = () => {
    if (times.length === 0 && days.length === 0) return;
    const ranges: TimeRange[] = [];
    for (let i = 0; i + 1 < times.length; i += 2) {
      // 24h is written as the end of a range; keep it distinct from 0h so the
      // range does not read as crossing midnight.
      ranges.push({ start: times[i], end: times[i + 1] });
    }
    if (times.length % 2 === 1) leftovers.push(`unpaired time ${times.at(-1)}`);
    clauses.push({ times: ranges, weekdays: [...new Set(days)].sort() });
    times = [];
    days = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case 'time':
        if (days.length > 0) flush(); // weekdays closed the previous clause
        times.push(token.minutes);
        break;

      case 'day': {
        // `LUN A VEN` — a range operator between two day tokens.
        const next = tokens[i + 1];
        const after = tokens[i + 2];
        if (next?.type === 'range' && after?.type === 'day') {
          days.push(...expandDayRange(token.day, after.day));
          i += 2;
        } else {
          days.push(token.day);
        }
        break;
      }

      case 'and':
      case 'range':
        break;

      case 'other':
        leftovers.push(token.text);
        break;
    }
  }

  flush();
  return { clauses, leftovers };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Leftover tokens that carry no schedule meaning and so are not failures.
 *
 * Two groups: French function words, and words describing the sign's physical
 * appearance (`CLIGNOTANT` = flashing, `FLECHE` = arrow, `ORANGE` = temporary
 * works signage). Neither changes when the restriction is in force.
 */
const IGNORABLE_LEFTOVERS = new RegExp(
  '^(?:' +
    [
      // function words and units
      "ET|EN|DE|DU|DES|LE|LA|LES|AUX?|OU|POUR|SUR|LORS|D'|",
      'LUN|MAR|MER|JEU|VEN|SAM|DIM',
      'LIMITE|MAX|MAXIMUM|SEULEMENT|MIN|JOURS?|CLASSE',
      // spatial and furniture descriptors
      "COTE[SD]?|DEUX|ANGLE|FILE|D'ECOLE|PARCOMETRE|PANNEAU|BORNE",
      // sign appearance
      'PICTO\\w*|AUTOCOL\\w*|PANONCEAU|CLIGNOTANT|FIXE|SILHOUETTE|FLECHE',
      'ORANGE|TEMPORAIRE|ENTRETIEN|TRAVAUX',
      // nouns already consumed as part of an exemption phrase
      'VEHICULES?|SERVICE|CORPS|VOITURE|STATIONNEMENT|HORAIRE|REGLEMENT',
      '\\d+|-|\\.|,',
    ].join('|') +
    ')$',
);

/** Sign texts that describe the street furniture rather than a restriction. */
const INFORMATIONAL =
  /^(?:PARCOMETRE|PANONCEAU|AUTOCOL|GS-|ATTENTION|STATIONNEMENT\s+TARIFE|BORNE)/;

export interface ParseResult extends Omit<Rule, 'id'> {}

export function parseRpa(raw: string): ParseResult {
  const normalized = normalize(raw);

  const base = {
    raw,
    exemptions: [] as Exemption[],
    clauses: [] as Clause[],
  };

  if (INFORMATIONAL.test(normalized)) {
    return { ...base, action: 'informational', confidence: 'full' };
  }

  const { rest: afterVehicle, appliesToVehicle } =
    extractVehicleTarget(normalized);
  const { rest: afterExemptions, exemptions } = extractExemptions(afterVehicle);
  const { rest: afterSeason, season } = extractSeason(afterExemptions);
  const { rest: afterAction, action } = extractAction(afterSeason);

  const schoolDaysOnly = /JOURS?\s+D'ECOLE/.test(afterAction);
  let working = afterAction
    .replace(/JOURS?\s+D'ECOLE/g, ' ')
    .replace(SPATIAL_QUALIFIERS, ' ');

  let maxDurationMin: number | undefined;
  if (action === 'parking_allowed') {
    const duration = extractDuration(working);
    working = duration.rest;
    maxDurationMin = duration.maxDurationMin;
  }

  // "EN TOUT TEMPS" states explicitly what a bare action marker implies.
  const alwaysInForce = /\bEN\s+TOUT\s+TEMPS\b|\bTOUT\s+TEMPS\b/.test(working);
  working = working.replace(/\bEN\s+TOUT\s+TEMPS\b|\bTOUT\s+TEMPS\b/g, ' ');

  const { clauses, leftovers } = parseClauses(tokenize(working));

  const significantLeftovers = leftovers.filter(
    (l) => !IGNORABLE_LEFTOVERS.test(l),
  );

  const hasSchedule = clauses.some(
    (c) => c.times.length > 0 || c.weekdays.length > 0,
  );

  // A sign bearing an action marker and no schedule is unconditional: `\P DEUX
  // COTES` and `P 15 MIN` are in force at all times. Treating "no schedule
  // found" as a parse failure would discard several thousand valid signs.
  const unconditional = alwaysInForce || !hasSchedule;

  let confidence: Confidence;
  if (significantLeftovers.length === 0) {
    confidence = 'full';
  } else if (hasSchedule || alwaysInForce) {
    // The schedule is understood; only some descriptive text was not.
    confidence = 'partial';
  } else {
    confidence = 'none';
  }

  return {
    ...base,
    action,
    clauses: unconditional ? [] : clauses,
    ...(season ? { season } : {}),
    ...(maxDurationMin != null ? { maxDurationMin } : {}),
    exemptions,
    ...(appliesToVehicle ? { appliesToVehicle } : {}),
    ...(schoolDaysOnly ? { schoolDaysOnly } : {}),
    confidence,
    ...(significantLeftovers.length > 0
      ? { unparsed: significantLeftovers }
      : {}),
  };
}
