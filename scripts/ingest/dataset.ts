/**
 * The one place both upstreams are read, filtered and aggregated.
 *
 * `normalize.ts` (checks) and `scripts/build/build.ts` (artifacts) both go
 * through here so they cannot disagree about what counts as a sign, which pole
 * it hangs on, or which integer names its rule.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseCsv } from './csv.ts';
import { normalizeAmd, type AmdOutput } from '../../packages/city-montreal/src/amd.ts';
import { parseRpa } from '../../packages/city-montreal/src/rpa-parser.ts';
import type { Rule } from '../../packages/rules-core/src/types.ts';

const RAW = fileURLToPath(new URL('../../data/raw/', import.meta.url));

export type Row = Record<string, string>;

/** Sign categories that concern on-street parking. */
const CATEGORIES = ['STATIONNEMENT', 'STAT-$', 'STAT. HORS RUE'];

/**
 * The only DESCRIPTION_REP value that means "this sign is on the street".
 * The others — Enlevé, En conception, Archive — are removed, planned and
 * historical signs respectively, and together are ~18% of the feed. Showing a
 * removed `P` as a green curb is precisely the failure this app must not make.
 */
const INSTALLED = 'Réel';

export function readRaw(name: string): Row[] {
  return parseCsv(readFileSync(`${RAW}${name}`, 'utf8'));
}

export interface Pole {
  lon: number;
  lat: number;
  borough: string;
  signs: Row[];
}

export interface Signage {
  /** Parking-category rows, whatever their lifecycle state. */
  all: Row[];
  /** Rows for signs actually installed on the street. */
  installed: Row[];
  /** Row counts per DESCRIPTION_REP, for reporting and the sanity check. */
  byRep: Map<string, number>;
}

export function loadSignage(): Signage {
  const all = readRaw('signalisation_stationnement.csv').filter((r) =>
    CATEGORIES.includes(r.DESCRIPTION_CAT),
  );

  const byRep = new Map<string, number>();
  for (const row of all) {
    byRep.set(row.DESCRIPTION_REP, (byRep.get(row.DESCRIPTION_REP) ?? 0) + 1);
  }

  return { all, installed: all.filter((r) => r.DESCRIPTION_REP === INSTALLED), byRep };
}

/**
 * Group signs onto their poles. Rows without usable coordinates are dropped;
 * a pole's coordinates are taken from the first row seen, which is safe because
 * every pole in the feed reports one consistent position.
 */
export function buildPoles(signage: Row[]): Map<string, Pole> {
  const poles = new Map<string, Pole>();

  for (const row of signage) {
    const lon = coord(row.Longitude);
    const lat = coord(row.Latitude);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const pole = poles.get(row.POTEAU_ID_POT) ?? {
      lon,
      lat,
      borough: row.NOM_ARROND,
      signs: [],
    };
    pole.signs.push(row);
    poles.set(row.POTEAU_ID_POT, pole);
  }

  return poles;
}

/**
 * The canonical rule id for a signage row: the city's own PANNEAU_ID_RPA.
 * Returns NaN when the field is blank — `Number('')` is 0, which would
 * otherwise pass an `isInteger` guard and collide with a real id.
 */
export function ruleIdOf(row: Row): number {
  const raw = row.PANNEAU_ID_RPA?.trim();
  return raw ? Number(raw) : NaN;
}

/** `Number('')` is 0, so blank coordinates must be rejected before coercion. */
function coord(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * The signage half of the rule dictionary, keyed by PANNEAU_ID_RPA.
 *
 * A dense first-seen index (what this used to be) reshuffles whenever the CSV
 * row order changes, so a client holding yesterday's tiles against today's
 * dictionary would silently mis-colour the city instead of failing. The city's
 * own id is stable across refreshes and maps to exactly one sign text.
 */
export function buildRuleDict(signage: Row[]): Rule[] {
  const rules: Rule[] = [];
  const seen = new Set<number>();

  for (const row of signage) {
    const id = ruleIdOf(row);
    if (!Number.isInteger(id) || seen.has(id)) continue;
    seen.add(id);
    rules.push({ id, ...parseRpa(row.DESCRIPTION_RPA.trim()) });
  }

  return rules.sort((a, b) => a.id - b.id);
}

export function signCounts(signage: Row[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of signage) {
    const id = ruleIdOf(row);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export interface AmdDataset extends AmdOutput {
  exportDate: string;
}

export function loadAmd(): AmdDataset {
  const out = normalizeAmd({
    places: readRaw('Places.csv'),
    reglementations: readRaw('Reglementations.csv'),
    emplacementReglementation: readRaw('EmplacementReglementation.csv'),
    reglementationPeriode: readRaw('ReglementationPeriode.csv'),
    periodes: readRaw('Periodes.csv'),
  });

  return { ...out, exportDate: readRaw('DateExportation.csv')[0]?.dDate ?? 'unknown' };
}

/**
 * AMD regulations share one integer namespace with signage rules. Signage ids
 * are PANNEAU_ID_RPA (observed max ~17k); AMD ids start well clear of them, and
 * are assigned by sorted code so the mapping is reproducible.
 */
export const AMD_ID_BASE = 1_000_000;

export function amdRuleIds(codes: Iterable<string>): Map<string, number> {
  const sorted = [...new Set(codes)].sort();
  return new Map(sorted.map((code, i) => [code, AMD_ID_BASE + i]));
}

export interface Combo {
  id: number;
  ruleIds: number[];
}

/**
 * Name each distinct set of rules with one integer.
 *
 * A map feature can only be matched on a single value, but a verdict belongs to
 * a *place*, not to one rule: a pole's answer is the most restrictive of every
 * panel on it, and a paid bay carries up to sixteen regulations at once. So the
 * feature carries a `comboId` naming its whole set, and the set is folded to a
 * status by `statusByComboId`.
 *
 * Colouring per rule instead of per place is what let a pole render green — one
 * panel's window having closed — while another panel forbade parking outright.
 *
 * Keyed by the sorted rule ids, so poles and bays share one namespace and the
 * numbering is reproducible across builds.
 */
export function buildCombos(sets: Iterable<number[]>): {
  idFor: (ruleIds: number[]) => number;
  combos: Combo[];
} {
  const keys = new Set<string>();
  for (const ids of sets) keys.add(comboKey(ids));

  const sorted = [...keys].sort();
  const byKey = new Map(sorted.map((key, i) => [key, i]));

  const combos: Combo[] = sorted.map((key, id) => ({
    id,
    ruleIds: key === '' ? [] : key.split(',').map(Number),
  }));

  return {
    idFor: (ruleIds) => {
      const id = byKey.get(comboKey(ruleIds));
      if (id === undefined) throw new Error(`no combo for [${ruleIds}]`);
      return id;
    },
    combos,
  };
}

/** Canonical key for a rule set: sorted, deduplicated, comma separated. */
export function comboKey(ruleIds: number[]): string {
  return [...new Set(ruleIds)].sort((a, b) => a - b).join(',');
}
