/**
 * Turn the normalized feeds into the artifacts the app downloads.
 *
 *   node --experimental-strip-types scripts/build/build.ts [--out data/out]
 *
 * Emits into the output directory:
 *
 *   poles.geojsonl    one feature per installed sign, for tippecanoe
 *   bays.geojsonl     one feature per paid space, for tippecanoe
 *   montreal.sqlite   rule dictionary + everything the detail sheet reads
 *   manifest.json     what the app polls to decide whether to re-download
 *
 * Tiles are deliberately thin: a feature carries its `ruleId` and little else,
 * because colouring is a MapLibre `match` over rule ids and every other field
 * would just be bytes the map never reads. Detail comes from SQLite.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import {
  amdRuleIds,
  buildCombos,
  buildPoles,
  buildRuleDict,
  comboKey,
  loadAmd,
  loadSignage,
  ruleIdOf,
  type Row,
} from '../ingest/dataset.ts';
import { isPaidSpace } from '../../packages/city-montreal/src/amd.ts';
import type { Rule } from '../../packages/rules-core/src/types.ts';

const SCHEMA_VERSION = 1;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const outDir = (
  arg('--out') ?? fileURLToPath(new URL('../../data/out/', import.meta.url))
).replace(/\/+$/, '');
mkdirSync(outDir, { recursive: true });

/** Sub-panels modify the panel above them and are never a rule on their own. */
const isSubPanel = (row: Row) => /^(PANONCEAU|AUTOCOL)/i.test(row.DESCRIPTION_RPA.trim());

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

console.log('loading feeds...');

const amd = loadAmd();
const { installed: signage } = loadSignage();
const poles = buildPoles(signage);
const signRules = buildRuleDict(signage);

// One integer namespace for both feeds: signage keeps the city's PANNEAU_ID_RPA,
// AMD regulations are numbered from AMD_ID_BASE by sorted code.
const amdIds = amdRuleIds(amd.rules.keys());
const amdRules: Rule[] = [...amd.rules]
  .map(([code, rule]) => ({ id: amdIds.get(code)!, ...rule }))
  .sort((a, b) => a.id - b.id);

const rules: Rule[] = [...signRules, ...amdRules];

// A bay can be governed by up to 16 regulations at once and a map `match`
// cannot evaluate a list, so each distinct set of regulations gets one id.
const { byKey: comboByKey, combos } = buildCombos(amd.spaces, amdIds);

console.log(`  rules      ${rules.length} (${signRules.length} signage + ${amdRules.length} AMD)`);
console.log(`  combos     ${combos.length}`);
console.log(`  poles      ${poles.size}`);
console.log(`  signs      ${signage.length}`);
console.log(`  spaces     ${amd.spaces.length}`);

// ---------------------------------------------------------------------------
// Rule dictionary version
// ---------------------------------------------------------------------------

/**
 * Identifies the id -> meaning mapping. Tiles and dictionary from one build
 * share it; the app refuses to colour when its tiles disagree with its
 * dictionary, so a shifted id fails loudly instead of mis-colouring.
 */
const ruleDictVersion =
  'sha256:' +
  createHash('sha256')
    .update(rules.map((r) => `${r.id}\t${r.raw}`).join('\n'))
    .digest('hex');

console.log(`  dict       ${ruleDictVersion.slice(0, 19)}…`);

// ---------------------------------------------------------------------------
// GeoJSON sequences (tippecanoe input)
// ---------------------------------------------------------------------------

const round = (n: number) => Number(n.toFixed(6)); // ~11 cm, far finer than the data

function feature(lon: number, lat: number, properties: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: [round(lon), round(lat)] },
  });
}

const poleLines: string[] = [];
for (const [poleId, pole] of poles) {
  for (const sign of pole.signs) {
    if (isSubPanel(sign)) continue;
    poleLines.push(
      feature(pole.lon, pole.lat, {
        pole: poleId,
        ruleId: ruleIdOf(sign),
        arrow: Number(sign.FLECHE_PAN) || 0,
      }),
    );
  }
}

// The marked-bay centre is the better map position than the pole itself.
const bayLines = amd.spaces.map((s) =>
  feature(s.centreLon, s.centreLat, {
    space: s.id,
    comboId: comboByKey.get(comboKey(s.ruleCodes))!,
    paid: isPaidSpace(s, amd.rules) ? 1 : 0,
  }),
);

const polesPath = `${outDir}/poles.geojsonl`;
const baysPath = `${outDir}/bays.geojsonl`;
writeFileSync(polesPath, poleLines.join('\n') + '\n');
writeFileSync(baysPath, bayLines.join('\n') + '\n');
console.log(`\nwrote ${poleLines.length} pole features, ${bayLines.length} bay features`);

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

const dbPath = `${outDir}/montreal.sqlite`;
const db = new DatabaseSync(dbPath);

db.exec(`
  DROP TABLE IF EXISTS rules;
  DROP TABLE IF EXISTS poles;
  DROP TABLE IF EXISTS signs;
  DROP TABLE IF EXISTS spaces;
  DROP TABLE IF EXISTS space_rules;
  DROP TABLE IF EXISTS combo_rules;
  DROP TABLE IF EXISTS meta;

  CREATE TABLE rules (
    id INTEGER PRIMARY KEY,
    raw TEXT NOT NULL,
    action TEXT NOT NULL,
    confidence TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE poles (
    id TEXT PRIMARY KEY,
    lon REAL NOT NULL,
    lat REAL NOT NULL,
    borough TEXT
  );
  CREATE TABLE signs (
    pole_id TEXT NOT NULL,
    position INTEGER,
    rule_id INTEGER NOT NULL,
    arrow INTEGER,
    is_subpanel INTEGER NOT NULL
  );
  CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    lon REAL NOT NULL,
    lat REAL NOT NULL,
    street TEXT,
    accessible INTEGER NOT NULL,
    hourly_rate_cents INTEGER,
    max_tariff_cents INTEGER,
    exploitation TEXT,
    paired TEXT,
    combo_id INTEGER NOT NULL
  );
  CREATE TABLE space_rules (
    space_id TEXT NOT NULL,
    rule_id INTEGER NOT NULL
  );
  -- comboId is what the bay tiles carry; this expands one back to its rules.
  CREATE TABLE combo_rules (
    combo_id INTEGER NOT NULL,
    rule_id INTEGER NOT NULL
  );
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

db.exec('BEGIN');

const insertRule = db.prepare(
  'INSERT INTO rules (id, raw, action, confidence, json) VALUES (?, ?, ?, ?, ?)',
);
for (const rule of rules) {
  insertRule.run(rule.id, rule.raw, rule.action, rule.confidence, JSON.stringify(rule));
}

const insertPole = db.prepare('INSERT INTO poles (id, lon, lat, borough) VALUES (?, ?, ?, ?)');
const insertSign = db.prepare(
  'INSERT INTO signs (pole_id, position, rule_id, arrow, is_subpanel) VALUES (?, ?, ?, ?, ?)',
);
for (const [poleId, pole] of poles) {
  insertPole.run(poleId, pole.lon, pole.lat, pole.borough);
  for (const sign of pole.signs) {
    insertSign.run(
      poleId,
      Number(sign.POSITION_POP) || 0,
      ruleIdOf(sign),
      Number(sign.FLECHE_PAN) || 0,
      isSubPanel(sign) ? 1 : 0,
    );
  }
}

const insertSpace = db.prepare(
  `INSERT INTO spaces
     (id, lon, lat, street, accessible, hourly_rate_cents, max_tariff_cents,
      exploitation, paired, combo_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertSpaceRule = db.prepare(
  'INSERT INTO space_rules (space_id, rule_id) VALUES (?, ?)',
);
for (const space of amd.spaces) {
  insertSpace.run(
    space.id,
    space.centreLon,
    space.centreLat,
    space.street,
    space.accessible ? 1 : 0,
    space.hourlyRateCents,
    space.maxTariffCents ?? null,
    space.exploitation,
    space.paired ?? null,
    comboByKey.get(comboKey(space.ruleCodes))!,
  );
  for (const code of space.ruleCodes) {
    const id = amdIds.get(code);
    if (id !== undefined) insertSpaceRule.run(space.id, id);
  }
}

const insertComboRule = db.prepare(
  'INSERT INTO combo_rules (combo_id, rule_id) VALUES (?, ?)',
);
for (const combo of combos) {
  for (const ruleId of combo.ruleIds) insertComboRule.run(combo.id, ruleId);
}

const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
insertMeta.run('schemaVersion', String(SCHEMA_VERSION));
insertMeta.run('exportDate', amd.exportDate);
insertMeta.run('ruleDictVersion', ruleDictVersion);

db.exec('COMMIT');

// The two queries the detail sheet actually makes.
db.exec('CREATE INDEX idx_signs_pole ON signs(pole_id)');
db.exec('CREATE INDEX idx_space_rules_space ON space_rules(space_id)');
db.exec('CREATE INDEX idx_combo_rules_combo ON combo_rules(combo_id)');
db.exec('VACUUM');
db.close();

console.log(`wrote ${dbPath}`);

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const manifestPath = `${outDir}/manifest.json`;
const manifest = {
  schemaVersion: SCHEMA_VERSION,
  exportDate: amd.exportDate,
  builtAt: new Date().toISOString(),
  ruleDictVersion,
  counts: {
    rules: rules.length,
    combos: combos.length,
    poles: poles.size,
    signs: signage.length,
    spaces: amd.spaces.length,
  },
  // `tiles` is filled in by the tile step; the app treats a missing entry as
  // "not published yet" rather than downloading a half-built release.
  artifacts: { db: describe(dbPath) },
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${manifestPath}`);

function describe(path: string): { bytes: number; sha256: string } {
  return {
    bytes: statSync(path).size,
    sha256: `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`,
  };
}
