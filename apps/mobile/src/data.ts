/**
 * Get the shipped artifacts onto disk and read the rule dictionary out of them.
 *
 * MapLibre Native reads PMTiles by byte range, which means it needs a real file
 * and a fully-qualified `pmtiles://file://…` URL. Android's AssetManager cannot
 * serve ranged reads at all, so every artifact is materialised into the app's
 * document directory before the map is told about it.
 *
 * The app carries data in its bundle and can also download newer data, so this
 * module owns the decision between them — see `installed.ts` for the rule, and
 * for the bug that motivated it.
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

import type { Rule, RuleCombo } from '@parkmtl/rules-core';

import {
  artifactNames,
  parseRecord,
  shouldInstallBundle,
  type BuildStamp,
  type InstalledRecord,
} from './installed.ts';

/** `file://…` form, which is what expo-file-system works in. */
export const DATA_DIR = `${FileSystem.documentDirectory}parkmtl`;

/**
 * Plain filesystem path form. expo-sqlite and MapLibre both want a real path,
 * not a URI — passing them the `file://` form silently fails to open.
 */
const DATA_PATH = DATA_DIR.replace(/^file:\/\//, '');

export const RECORD_PATH = `${DATA_DIR}/installed.json`;

/** The basemap never changes with the data, so it keeps one fixed name. */
const BASEMAP = 'montreal-base.pmtiles';

export interface Artifacts {
  /** `pmtiles://file://…` URL for the parking data tileset. */
  dataTilesUrl: string;
  /** `pmtiles://file://…` URL for the offline basemap. */
  baseTilesUrl: string;
  rules: Rule[];
  combos: RuleCombo[];
  meta: Record<string, string>;
  /** Which copy this is, and where it came from. */
  installed: InstalledRecord;
  /**
   * Left open for the lifetime of the app.
   *
   * The rule dictionary is small enough to hold in memory, but the per-pole
   * panel list and the tariff tables are not — a detail sheet queries them on
   * every tap, and reopening a 15 MB database each time would be absurd.
   */
  db: SQLite.SQLiteDatabase;
}

export async function readRecord(): Promise<InstalledRecord | null> {
  try {
    const info = await FileSystem.getInfoAsync(RECORD_PATH);
    if (!info.exists) return null;
    return parseRecord(await FileSystem.readAsStringAsync(RECORD_PATH));
  } catch {
    return null;
  }
}

export async function writeRecord(record: InstalledRecord): Promise<void> {
  await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true }).catch(() => {});
  await FileSystem.writeAsStringAsync(RECORD_PATH, JSON.stringify(record));
}

/** Copy a bundled asset to a specific name, if it is not already there. */
async function materialise(assetModule: number, name: string): Promise<string> {
  const target = `${DATA_DIR}/${name}`;

  const existing = await FileSystem.getInfoAsync(target);
  if (existing.exists && existing.size > 0) return target;

  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error(`asset ${name} has no local URI after download`);

  await FileSystem.copyAsync({ from: asset.localUri, to: target });
  return target;
}

/**
 * Remove artifact files that no build refers to any more.
 *
 * Versioned names mean a superseded set lingers after an update; without this,
 * every refresh would leave another 18 MB behind. The basemap and the record
 * are never swept.
 */
async function sweep(keep: Set<string>): Promise<void> {
  try {
    const entries = await FileSystem.readDirectoryAsync(DATA_DIR);
    for (const name of entries) {
      if (keep.has(name) || name === BASEMAP || name === 'installed.json') continue;
      if (!/^montreal-.*\.(sqlite|pmtiles)$/.test(name)) continue;
      await FileSystem.deleteAsync(`${DATA_DIR}/${name}`, { idempotent: true });
    }
  } catch {
    // Cleanup is housekeeping; failing it must not stop the app from starting.
  }
}

export async function loadArtifacts(): Promise<Artifacts> {
  await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true }).catch(() => {});

  const manifest = require('../assets/data/manifest.json') as BuildStamp;
  const existing = await readRecord();

  // Install the bundled copy only when it is genuinely newer. Anything already
  // on disk that is newer came from a download and must survive.
  let record: InstalledRecord;
  if (shouldInstallBundle(manifest, existing)) {
    const names = artifactNames(manifest.ruleDictVersion);
    await Promise.all([
      materialise(require('../assets/data/montreal.pmtiles'), names.tiles),
      materialise(require('../assets/data/montreal.sqlite'), names.db),
    ]);
    record = {
      ruleDictVersion: manifest.ruleDictVersion,
      exportDate: manifest.exportDate,
      builtAt: manifest.builtAt ?? new Date(0).toISOString(),
      source: 'bundle',
      ...(existing?.lastCheckedAt ? { lastCheckedAt: existing.lastCheckedAt } : {}),
    };
    await writeRecord(record);
  } else {
    record = existing!;
  }

  // The basemap is bundled and fixed; it is also the 62 MB that must never be
  // re-copied on a data refresh.
  const baseTiles = await materialise(require('../assets/data/montreal-base.pmtiles'), BASEMAP);

  const names = artifactNames(record.ruleDictVersion);
  await sweep(new Set([names.db, names.tiles]));

  const db = await SQLite.openDatabaseAsync(names.db, undefined, DATA_PATH);

  const ruleRows = await db.getAllAsync<{ json: string }>('SELECT json FROM rules');
  const rules = ruleRows.map((r) => JSON.parse(r.json) as Rule);

  const comboRows = await db.getAllAsync<{ combo_id: number; rule_id: number }>(
    'SELECT combo_id, rule_id FROM combo_rules ORDER BY combo_id',
  );
  const byCombo = new Map<number, number[]>();
  for (const row of comboRows) {
    const list = byCombo.get(row.combo_id) ?? [];
    list.push(row.rule_id);
    byCombo.set(row.combo_id, list);
  }
  const combos: RuleCombo[] = [...byCombo].map(([id, ruleIds]) => ({ id, ruleIds }));

  const metaRows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM meta',
  );
  const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));

  return {
    // MapLibre Native needs the URL inside pmtiles:// fully qualified.
    dataTilesUrl: `pmtiles://file://${DATA_PATH}/${names.tiles}`,
    baseTilesUrl: `pmtiles://file://${baseTiles.replace(/^file:\/\//, '')}`,
    rules,
    combos,
    meta,
    installed: record,
    db,
  };
}

// ---------------------------------------------------------------------------
// Detail queries
// ---------------------------------------------------------------------------

export interface PoleSign {
  position: number;
  ruleId: number;
  arrow: number;
  isSubPanel: boolean;
  raw: string;
  confidence: string;
}

export interface PoleDetail {
  id: string;
  borough: string | null;
  signs: PoleSign[];
}

/**
 * Everything on one pole, top panel first.
 *
 * The tiles carry one feature per sign but omit sub-panels, so the panel list
 * has to come from here: a `PANONCEAU` modifies the panel above it and reading
 * it standalone would invent a rule nobody signed.
 */
export async function poleDetail(
  db: SQLite.SQLiteDatabase,
  poleId: string,
): Promise<PoleDetail | null> {
  const pole = await db.getFirstAsync<{ id: string; borough: string | null }>(
    'SELECT id, borough FROM poles WHERE id = ?',
    poleId,
  );
  if (!pole) return null;

  const rows = await db.getAllAsync<{
    position: number;
    rule_id: number;
    arrow: number;
    is_subpanel: number;
    raw: string;
    confidence: string;
  }>(
    `SELECT s.position, s.rule_id, s.arrow, s.is_subpanel, r.raw, r.confidence
       FROM signs s JOIN rules r ON r.id = s.rule_id
      WHERE s.pole_id = ?
      ORDER BY s.position`,
    poleId,
  );

  return {
    id: pole.id,
    borough: pole.borough,
    signs: rows.map((r) => ({
      position: r.position,
      ruleId: r.rule_id,
      arrow: r.arrow,
      isSubPanel: r.is_subpanel === 1,
      raw: r.raw,
      confidence: r.confidence,
    })),
  };
}

export interface SpaceDetail {
  id: string;
  street: string | null;
  accessible: boolean;
  hourlyRateCents: number | null;
  maxTariffCents: number | null;
  exploitation: string | null;
  paired: string | null;
  comboId: number;
  ruleIds: number[];
}

/** A paid bay: its tariff, and the regulations its combo expands to. */
export async function spaceDetail(
  db: SQLite.SQLiteDatabase,
  spaceId: string,
): Promise<SpaceDetail | null> {
  const row = await db.getFirstAsync<{
    id: string;
    street: string | null;
    accessible: number;
    hourly_rate_cents: number | null;
    max_tariff_cents: number | null;
    exploitation: string | null;
    paired: string | null;
    combo_id: number;
  }>('SELECT * FROM spaces WHERE id = ?', spaceId);
  if (!row) return null;

  const rules = await db.getAllAsync<{ rule_id: number }>(
    'SELECT rule_id FROM combo_rules WHERE combo_id = ?',
    row.combo_id,
  );

  return {
    id: row.id,
    street: row.street,
    accessible: row.accessible === 1,
    hourlyRateCents: row.hourly_rate_cents,
    maxTariffCents: row.max_tariff_cents,
    exploitation: row.exploitation,
    paired: row.paired,
    comboId: row.combo_id,
    ruleIds: rules.map((r) => r.rule_id),
  };
}
