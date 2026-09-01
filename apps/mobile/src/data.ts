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

const DATA_DIR = `${FileSystem.documentDirectory}parkmtl`;

export interface Artifacts {
  /** `pmtiles://file://…` URL for the parking data tileset. */
  dataTilesUrl: string;
  /** `pmtiles://file://…` URL for the offline basemap. */
  baseTilesUrl: string;
  rules: Rule[];
  combos: RuleCombo[];
  meta: Record<string, string>;
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

export async function loadArtifacts(): Promise<Artifacts> {
  await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true }).catch(() => {});

  const [dataTiles, baseTiles, dbPath] = await Promise.all([
    materialise(require('../assets/data/montreal.pmtiles'), 'montreal.pmtiles'),
    materialise(require('../assets/data/montreal-base.pmtiles'), 'montreal-base.pmtiles'),
    materialise(require('../assets/data/montreal.sqlite'), 'montreal.sqlite'),
  ]);

  const db = await SQLite.openDatabaseAsync(dbPath, undefined, dbPath);

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

  await db.closeAsync();

  return {
    dataTilesUrl: `pmtiles://file://${dataTiles.replace('file://', '')}`,
    baseTilesUrl: `pmtiles://file://${baseTiles.replace('file://', '')}`,
    rules,
    combos,
    meta,
  };
}
