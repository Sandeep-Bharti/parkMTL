/**
 * Get the shipped artifacts onto disk and read the rule dictionary out of them.
 *
 * MapLibre Native reads PMTiles by byte range, which means it needs a real file
 * and a fully-qualified `pmtiles://file://…` URL. Android's AssetManager cannot
 * serve ranged reads at all, so every artifact is materialised into the app's
 * document directory before the map is told about it. Phase 6 will replace the
 * bundled copies with downloads into the same place, so nothing above this
 * layer has to change.
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

import type { Rule } from '@parkmtl/rules-core';
import type { RuleCombo } from '@parkmtl/rules-core';

/** `file://…` form, which is what expo-file-system works in. */
export const DATA_DIR = `${FileSystem.documentDirectory}parkmtl`;

/**
 * Plain filesystem path form. expo-sqlite and MapLibre both want a real path,
 * not a URI — passing them the `file://` form silently fails to open.
 */
const DATA_PATH = DATA_DIR.replace(/^file:\/\//, '');

const DB_NAME = 'montreal.sqlite';

export interface Artifacts {
  /** `pmtiles://file://…` URL for the parking data tileset. */
  dataTilesUrl: string;
  /** `pmtiles://file://…` URL for the offline basemap. */
  baseTilesUrl: string;
  rules: Rule[];
  combos: RuleCombo[];
  meta: Record<string, string>;
  /**
   * Left open for the lifetime of the app.
   *
   * The rule dictionary is small enough to hold in memory, but the per-pole
   * panel list and the tariff tables are not — a detail sheet queries them on
   * every tap, and reopening a 15 MB database each time would be absurd.
   */
  db: SQLite.SQLiteDatabase;
}

/**
 * Copy a bundled asset into the document directory, once.
 *
 * `Asset.downloadAsync` already puts the file in the cache directory, but the
 * cache is evictable and the path is not stable across launches, so the file is
 * copied somewhere it will survive.
 */
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
 * Drop the materialised copies when the shipped data has moved on.
 *
 * Tiles and dictionary must come from the same build — that is what
 * `ruleDictVersion` guarantees — so they are replaced as a set, never one at a
 * time. Without this, rebuilding the artifacts would leave the app reading
 * yesterday's copies and colouring the city against the wrong dictionary.
 */
async function clearIfStale(version: string): Promise<void> {
  const stampPath = `${DATA_DIR}/VERSION`;
  const stamp = await FileSystem.getInfoAsync(stampPath);

  if (stamp.exists) {
    const current = await FileSystem.readAsStringAsync(stampPath);
    if (current === version) return;
    await FileSystem.deleteAsync(DATA_DIR, { idempotent: true });
  }

  await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true }).catch(() => {});
  await FileSystem.writeAsStringAsync(stampPath, version);
}

export async function loadArtifacts(): Promise<Artifacts> {
  await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true }).catch(() => {});

  const manifest = require('../assets/data/manifest.json') as { ruleDictVersion: string };
  await clearIfStale(manifest.ruleDictVersion);

  const [dataTiles, baseTiles] = await Promise.all([
    materialise(require('../assets/data/montreal.pmtiles'), 'montreal.pmtiles'),
    materialise(require('../assets/data/montreal-base.pmtiles'), 'montreal-base.pmtiles'),
    materialise(require('../assets/data/montreal.sqlite'), DB_NAME),
  ]);

  // `databaseName` is a file name and `directory` is the folder holding it —
  // not two halves of a path.
  const db = await SQLite.openDatabaseAsync(DB_NAME, undefined, DATA_PATH);

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
    dataTilesUrl: `pmtiles://file://${dataTiles.replace(/^file:\/\//, '')}`,
    baseTilesUrl: `pmtiles://file://${baseTiles.replace(/^file:\/\//, '')}`,
    rules,
    combos,
    meta,
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
