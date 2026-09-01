/**
 * Join both upstreams into the normalized shape the build artifacts are made
 * from, and assert the result looks sane.
 *
 *   node --experimental-strip-types scripts/ingest/normalize.ts [--json data/out]
 *
 * The expectation checks are deliberately loose bounds rather than exact counts:
 * both feeds change daily, so the aim is to catch a truncated download or an
 * encoding regression, not to pin every row.
 */

import { mkdirSync, writeFileSync } from 'node:fs';

import {
  buildPoles,
  buildRuleDict,
  loadAmd,
  loadSignage,
  signCounts,
} from './dataset.ts';
import type { Rule } from '../../packages/rules-core/src/types.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

// ---------------------------------------------------------------------------
// Agence de mobilité durable
// ---------------------------------------------------------------------------

console.log('reading Agence de mobilité durable data...');

const amd = loadAmd();
const { exportDate } = amd;

console.log(`  export date        ${exportDate}`);
console.log(`  paid spaces        ${amd.spaces.length}`);
console.log(`  regulation codes   ${amd.rules.size}`);
console.log(`  accessible spaces  ${amd.spaces.filter((s) => s.accessible).length}`);
console.log(`  with bike rack     ${amd.spaces.filter((s) => s.bikeRack).length}`);
console.log(
  `  mean rules/space   ${(
    amd.spaces.reduce((n, s) => n + s.ruleCodes.length, 0) / amd.spaces.length
  ).toFixed(2)}`,
);

const orphanCodes = new Set(
  amd.spaces.flatMap((s) => s.ruleCodes).filter((c) => !amd.rules.has(c)),
);
if (orphanCodes.size > 0) {
  console.log(
    `  ⚠ ${orphanCodes.size} regulation codes referenced by spaces but absent from Reglementations.csv`,
  );
  console.log(`    e.g. ${[...orphanCodes].slice(0, 8).join(', ')}`);
}

if (amd.warnings.length > 0) {
  const unique = [...new Set(amd.warnings)];
  console.log(`  ⚠ ${amd.warnings.length} warnings (${unique.length} distinct)`);
  for (const w of unique.slice(0, 5)) console.log(`    ${w}`);
}

// Encoding canary: this street name mojibakes if the CSV was read as UTF-8.
const accented = amd.spaces.filter((s) => /[éèêàôûç]/i.test(s.street)).length;
console.log(`  accented street names ${accented} (0 would mean an encoding regression)`);

// ---------------------------------------------------------------------------
// Ville de Montréal signage
// ---------------------------------------------------------------------------

console.log('\nreading Ville de Montréal signage data...');

const { all: signageAll, installed: signage, byRep } = loadSignage();
const poles = buildPoles(signage);
const rules = buildRuleDict(signage);
const signCountByRule = signCounts(signage);

const signsFor = (predicate: (r: Rule) => boolean) =>
  rules.filter(predicate).reduce((n, r) => n + (signCountByRule.get(r.id) ?? 0), 0);

console.log(`  sign rows          ${signage.length} installed (of ${signageAll.length})`);
for (const [rep, n] of [...byRep].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${rep.padEnd(15)} ${n}${rep === 'Réel' ? '' : '  (excluded)'}`);
}
console.log(`  distinct poles     ${poles.size}`);
console.log(`  boroughs           ${new Set(signage.map((r) => r.NOM_ARROND)).size}`);
console.log(`  distinct rules     ${rules.length}`);
console.log(
  `  mean signs/pole    ${([...poles.values()].reduce((n, p) => n + p.signs.length, 0) / poles.size).toFixed(2)}`,
);

const fullSigns = signsFor((r) => r.confidence === 'full');
console.log(
  `  parse coverage     ${((fullSigns / signage.length) * 100).toFixed(2)}% of signs fully understood`,
);

// ---------------------------------------------------------------------------
// Sanity bounds
// ---------------------------------------------------------------------------

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [
  {
    label: 'paid spaces in expected range',
    ok: amd.spaces.length > 15_000 && amd.spaces.length < 25_000,
    detail: `${amd.spaces.length} (expected 15k-25k)`,
  },
  {
    label: 'installed sign rows in expected range',
    ok: signage.length > 100_000 && signage.length < 160_000,
    detail: `${signage.length} (expected 100k-160k)`,
  },
  {
    // Guards against DESCRIPTION_REP being renamed or re-valued upstream, which
    // would silently empty the dataset rather than fail.
    label: 'installed signs are the bulk of the feed',
    ok: signage.length / signageAll.length > 0.6,
    detail: `${((signage.length / signageAll.length) * 100).toFixed(1)}% Réel (expected >60%)`,
  },
  {
    label: 'poles in expected range',
    ok: poles.size > 70_000 && poles.size < 120_000,
    detail: `${poles.size} (expected 70k-120k)`,
  },
  {
    label: 'all 20 boroughs present',
    ok: new Set(signage.map((r) => r.NOM_ARROND)).size >= 19,
    detail: `${new Set(signage.map((r) => r.NOM_ARROND)).size}`,
  },
  {
    label: 'AMD encoding intact',
    ok: accented > 1000,
    detail: `${accented} accented street names`,
  },
  {
    label: 'parse coverage above 95%',
    ok: fullSigns / signage.length >= 0.95,
    detail: `${((fullSigns / signage.length) * 100).toFixed(2)}%`,
  },
  {
    label: 'every space has at least one regulation',
    ok: amd.spaces.filter((s) => s.ruleCodes.length === 0).length < amd.spaces.length * 0.05,
    detail: `${amd.spaces.filter((s) => s.ruleCodes.length === 0).length} without`,
  },
];

console.log('\nchecks:');
let failed = 0;
for (const check of checks) {
  console.log(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.label.padEnd(42)} ${check.detail}`);
  if (!check.ok) failed++;
}

// Nothing is written when a check failed: CI must never publish artifacts built
// from a feed that looks wrong.
if (failed > 0) {
  console.error(`\n${failed} check(s) failed — no output written`);
  process.exit(1);
}

const outDir = arg('--json');
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    `${outDir}/rules.json`,
    JSON.stringify({ exportDate, rules }, null, 2),
  );
  writeFileSync(
    `${outDir}/spaces.json`,
    JSON.stringify({ exportDate, spaces: amd.spaces }, null, 2),
  );
  console.log(`\nwrote normalized output to ${outDir}/`);
}

const corpusOut = arg('--corpus');
if (corpusOut) {
  // The id column is the canonical PANNEAU_ID_RPA, so the coverage report and
  // the build artifacts agree on which integer names which rule.
  const lines = rules
    .map((r) => ({ count: signCountByRule.get(r.id) ?? 0, id: r.id, description: r.raw }))
    .sort((a, b) => b.count - a.count || a.id - b.id);
  writeFileSync(
    corpusOut,
    `count\tid\tdescription\n${lines.map((l) => `${l.count}\t${l.id}\t${l.description}`).join('\n')}\n`,
  );
  console.log(`wrote rule corpus to ${corpusOut} (${lines.length} rules)`);
}

console.log('\nall checks passed');
