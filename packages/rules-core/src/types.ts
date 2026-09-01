/**
 * City-neutral parking rule model.
 *
 * Nothing in this package knows about Montreal, French, or any particular CSV
 * schema. City adapters (see `packages/city-montreal`) are responsible for
 * turning local sign text into these structures.
 */

/** What a sign does during the window it applies to. */
export type SignAction =
  /** Standing prohibited (Montreal `\A`). Stricter than `no_parking`. */
  | 'no_standing'
  /** Parking prohibited (Montreal `\P`). */
  | 'no_parking'
  /** Parking positively permitted, usually with a duration cap (Montreal `P`). */
  | 'parking_allowed'
  /** Carries no schedule semantics (pictograms, notices, pay-station markers). */
  | 'informational';

/**
 * Minutes since local midnight. `end <= start` means the range crosses
 * midnight, e.g. 19h-7h is `{ start: 1140, end: 420 }`.
 */
export interface TimeRange {
  start: number;
  end: number;
}

export interface MonthDay {
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

/** A seasonal window. May wrap the end of the year (e.g. Nov 1 - Apr 1). */
export interface Season {
  from: MonthDay;
  to: MonthDay;
}

/**
 * One time/weekday pairing. A sign may carry several: for example
 * `18h-3h LUN A VEN ET 9h-3h SAM DIM` is two clauses with different hours.
 *
 * Empty `times` means all day; empty `weekdays` means every day.
 */
export interface Clause {
  times: TimeRange[];
  /** 0 = Sunday ... 6 = Saturday. */
  weekdays: number[];
}

export type ExemptionKind =
  | 'permit_resident'
  | 'disabled'
  | 'ev_charging'
  | 'taxi'
  | 'bus'
  | 'delivery'
  | 'carshare'
  | 'school_bus'
  | 'motorcycle'
  | 'emergency'
  | 'municipal'
  | 'diplomatic'
  | 'hotel'
  | 'daycare'
  | 'authorized'
  | 'other';

/**
 * Vehicle class a restriction is aimed at.
 *
 * Distinct from an exemption, and the two read as near-opposites on the sign:
 * `\P AUX CAMIONS` prohibits *only* trucks (a car may park), whereas
 * `\P EXCEPTE MOTOS` prohibits everything *but* motorcycles.
 */
export type VehicleClass = 'truck' | 'trailer' | 'motorcycle' | 'bus' | 'bicycle';

export interface Exemption {
  kind: ExemptionKind;
  /** Verbatim source text, so the UI can always show what the sign really said. */
  raw: string;
  /** Permit sector identifier where the source names one. */
  zone?: string;
}

/**
 * How much of the source text the parser understood. Anything below `full`
 * makes the UI fall back to showing the raw sign text.
 */
export type Confidence = 'full' | 'partial' | 'none';

export interface Rule {
  /** Dense index into the rule dictionary; becomes the `ruleId` map feature property. */
  id: number;
  action: SignAction;
  clauses: Clause[];
  season?: Season;
  /** Duration cap in minutes, from e.g. `P 2h` or `P 15 min`. */
  maxDurationMin?: number;
  exemptions: Exemption[];
  /**
   * Present when the restriction targets one vehicle class only. A rule so
   * marked imposes nothing on an ordinary car.
   */
  appliesToVehicle?: VehicleClass;
  /** Sign applies only on school days — calendar-dependent, so never auto-resolved. */
  schoolDaysOnly?: boolean;
  /** Verbatim source text. Always retained; the UI shows it on tap. */
  raw: string;
  confidence: Confidence;
  /** Notes on what the parser could not account for, for the coverage report. */
  unparsed?: string[];
}

/**
 * Resolved parking status, ordered least to most restrictive. `compareStatus`
 * relies on this ordering when combining the several signs on one pole.
 */
export type Status =
  | 'free'
  | 'paid'
  | 'limited'
  | 'permit_only'
  | 'no_parking'
  | 'no_standing'
  | 'unknown';

const SEVERITY: Record<Status, number> = {
  free: 0,
  paid: 1,
  limited: 2,
  permit_only: 3,
  no_parking: 4,
  no_standing: 5,
  // Unknown outranks everything: if we cannot read a sign we must not imply
  // the spot is usable.
  unknown: 6,
};

/** Positive when `a` is more restrictive than `b`. */
export function compareStatus(a: Status, b: Status): number {
  return SEVERITY[a] - SEVERITY[b];
}

export function mostRestrictive(statuses: Status[]): Status {
  return statuses.reduce<Status>(
    (worst, s) => (compareStatus(s, worst) > 0 ? s : worst),
    'free',
  );
}

/** A point in time expressed in the city's local zone. */
export interface LocalTime {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
}

export interface Assessment {
  status: Status;
  /** Rules active at the assessed instant, most restrictive first. */
  active: Rule[];
  /** When the status next changes, or null if it does not within the horizon. */
  until: Date | null;
  /** Status taking effect at `until`. */
  next: Status | null;
  /** True when any contributing rule was not fully understood. */
  needsVerification: boolean;
}
