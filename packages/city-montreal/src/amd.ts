/**
 * Agence de mobilité durable adapter — paid on-street parking.
 *
 * Unlike the city signage feed, this data is already structured: `Periodes.csv`
 * carries explicit start/end times and weekday flags, so the schedule needs no
 * text parsing. The join is:
 *
 *   Places -> EmplacementReglementation -> Reglementations
 *                                       -> ReglementationPeriode -> Periodes
 *
 * The descriptions in `ReglementationPeriode` are labels only; the structured
 * period rows are authoritative and are what this module reads.
 */

import type {
  Clause,
  Exemption,
  Rule,
  Season,
  SignAction,
  TimeRange,
} from '../../rules-core/src/types.ts';

// ---------------------------------------------------------------------------
// Regulation types
// ---------------------------------------------------------------------------

interface TypeSemantics {
  action: SignAction;
  exemptions?: Exemption[];
  /** Space is metered while the rule is in force. */
  paid?: boolean;
  label: string;
}

/**
 * `Reglementations.sType` -> meaning, established by reading a representative
 * period description for each code (see `docs/data-notes.md`).
 */
const TYPE_SEMANTICS: Record<string, TypeSemantics> = {
  // "STAT. INT. 8 h - 9 h 30 LUN À VEN" — parking prohibited.
  I: { action: 'no_parking', label: 'Stationnement interdit' },
  A: { action: 'no_parking', label: 'Stationnement interdit' },
  // "ARRET INT. 6 h - 9 h 30 LUN À VEN AVEC REMORQUAGE" — standing prohibited.
  R: { action: 'no_standing', label: 'Arrêt interdit' },
  // "LUN à VEN 8h-23h ..." with an hourly tariff — metered hours.
  U: { action: 'parking_allowed', paid: true, label: 'Stationnement tarifé' },
  D: { action: 'parking_allowed', paid: true, label: 'Tarif journalier' },
  M: { action: 'parking_allowed', paid: true, label: 'Tarif maximum' },
  // "MAX 3 h 9h - 18 h SAM" — duration-capped free parking.
  Q: { action: 'parking_allowed', label: 'Durée maximale' },
  P: { action: 'parking_allowed', label: 'Durée maximale' },
  // "Stationnement gratuit 8h-10h LUN-VEN"
  G: { action: 'parking_allowed', label: 'Stationnement gratuit' },
  H: {
    action: 'no_parking',
    exemptions: [{ kind: 'disabled', raw: 'Réservé aux handicapés' }],
    label: 'Réservé aux personnes handicapées',
  },
  B: {
    action: 'no_parking',
    exemptions: [{ kind: 'ev_charging', raw: 'Véhicule électrique en recharge' }],
    label: 'Réservé aux véhicules électriques en recharge',
  },
  // Bicycle-tethering prohibition: no bearing on parking a car.
  Z: { action: 'informational', label: 'Avis' },
  F: { action: 'informational', label: 'Avis' },
};

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface ParkingSpace {
  /** `sNoPlace`, e.g. "A024" — the number printed on the pole. */
  id: string;
  lon: number;
  lat: number;
  /** Centre of the marked bay; better for map placement than the pole point. */
  centreLon: number;
  centreLat: number;
  street: string;
  accessible: boolean;
  /** "Double" spaces share a pole with the bay named in `sAutreTete`. */
  paired?: string;
  hourlyRateCents: number;
  maxTariffCents?: number;
  bikeRack: boolean;
  exploitation: string;
  ruleCodes: string[];
}

type Row = Record<string, string>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "08:30:00" -> minutes since midnight. */
function toMinutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** "0104" (DDMM) -> { month: 4, day: 1 }. */
function toMonthDay(ddmm: string): { month: number; day: number } {
  return { month: Number(ddmm.slice(2, 4)), day: Number(ddmm.slice(0, 2)) };
}

/** A year-round window carries no seasonal meaning and is dropped. */
function toSeason(start: string, end: string): Season | undefined {
  if (start === '0101' && end === '3112') return undefined;
  return { from: toMonthDay(start), to: toMonthDay(end) };
}

const WEEKDAY_FLAGS: Array<[string, number]> = [
  ['bDim', 0],
  ['bLun', 1],
  ['bMar', 2],
  ['bMer', 3],
  ['bJeu', 4],
  ['bVen', 5],
  ['bSam', 6],
];

function toClause(period: Row): Clause {
  const weekdays = WEEKDAY_FLAGS.filter(([field]) => period[field] === '1').map(
    ([, day]) => day,
  );

  const times: TimeRange[] = [
    { start: toMinutes(period.dtHeureDebut), end: toMinutes(period.dtHeureFin) },
  ];

  return {
    times,
    // All seven flags set is the same as "every day"; an empty list says so.
    weekdays: weekdays.length === 7 ? [] : weekdays,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AmdInput {
  places: Row[];
  reglementations: Row[];
  emplacementReglementation: Row[];
  reglementationPeriode: Row[];
  periodes: Row[];
}

export interface AmdOutput {
  spaces: ParkingSpace[];
  /** Keyed by regulation code, e.g. "CH-AA". */
  rules: Map<string, Omit<Rule, 'id'>>;
  warnings: string[];
}

export function normalizeAmd(input: AmdInput): AmdOutput {
  const warnings: string[] = [];

  const periodsById = new Map(input.periodes.map((p) => [p.nID, p]));

  // regulation code -> its period ids
  const periodsByCode = new Map<string, string[]>();
  for (const row of input.reglementationPeriode) {
    const list = periodsByCode.get(row.sCode) ?? [];
    list.push(row.noPeriode);
    periodsByCode.set(row.sCode, list);
  }

  const rules = new Map<string, Omit<Rule, 'id'>>();
  for (const reg of input.reglementations) {
    const code = reg.Name;
    const semantics = TYPE_SEMANTICS[reg.Type];

    if (!semantics) {
      warnings.push(`unknown regulation type "${reg.Type}" for code ${code}`);
    }

    const clauses: Clause[] = [];
    for (const periodId of periodsByCode.get(code) ?? []) {
      const period = periodsById.get(periodId);
      if (!period) {
        warnings.push(`code ${code} references missing period ${periodId}`);
        continue;
      }
      clauses.push(toClause(period));
    }

    const maxHeures = Number(reg.maxHeures);
    // Type M uses a sentinel (1100) rather than a real duration.
    const maxDurationMin =
      maxHeures > 0 && maxHeures <= 24 ? maxHeures * 60 : undefined;

    rules.set(code, {
      action: semantics?.action ?? 'no_parking',
      clauses,
      ...(toSeason(reg.DateDebut, reg.DateFin)
        ? { season: toSeason(reg.DateDebut, reg.DateFin)! }
        : {}),
      ...(maxDurationMin != null ? { maxDurationMin } : {}),
      exemptions: semantics?.exemptions ?? [],
      raw: semantics?.label ?? `Règlement ${code}`,
      // No type mapping means we cannot say when the rule applies.
      confidence: semantics ? 'full' : 'none',
    });
  }

  // place id -> regulation codes
  const codesByPlace = new Map<string, string[]>();
  for (const row of input.emplacementReglementation) {
    const list = codesByPlace.get(row.sNoEmplacement) ?? [];
    list.push(row.sCodeAutocollant);
    codesByPlace.set(row.sNoEmplacement, list);
  }

  const spaces: ParkingSpace[] = [];
  for (const row of input.places) {
    const lon = Number(row.nLongitude);
    const lat = Number(row.nLatitude);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      warnings.push(`place ${row.sNoPlace} has no usable coordinates`);
      continue;
    }

    const centreLon = Number(row.nPositionCentreLongitude);
    const centreLat = Number(row.nPositionCentreLatitude);

    spaces.push({
      id: row.sNoPlace,
      lon,
      lat,
      centreLon: Number.isFinite(centreLon) ? centreLon : lon,
      centreLat: Number.isFinite(centreLat) ? centreLat : lat,
      street: row.sNomRue,
      accessible: row.sGenre === 'HANDICAPÉ',
      ...(row.sAutreTete ? { paired: row.sAutreTete } : {}),
      // Tariffs are published in cents: 425 is $4.25/h.
      hourlyRateCents: Number(row.nTarifHoraire) || 0,
      ...(row.nTarifMax ? { maxTariffCents: Number(row.nTarifMax) } : {}),
      bikeRack: Number(row.nSupVelo) > 0,
      exploitation: row.sTypeExploitation,
      ruleCodes: codesByPlace.get(row.sNoPlace) ?? [],
    });
  }

  return { spaces, rules, warnings };
}

/** True when the space is metered under any of its regulations. */
export function isPaidSpace(
  space: ParkingSpace,
  rules: Map<string, Omit<Rule, 'id'>>,
): boolean {
  return space.ruleCodes.some((code) => {
    const rule = rules.get(code);
    return rule?.action === 'parking_allowed' && space.hourlyRateCents > 0;
  });
}

export function formatTariff(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
