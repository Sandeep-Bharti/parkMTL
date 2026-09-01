/**
 * Run the RPA parser across the full sign corpus and report coverage.
 *
 * Coverage is weighted by sign count, not by distinct string: getting the top
 * 400 strings right covers 93% of signs on the street, and that is the number
 * that matters to a driver. CI fails below the threshold.
 *
 *   node --experimental-strip-types scripts/ingest/parse-rules.ts [--json out.json] [--min 95]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseRpa } from '../../packages/city-montreal/src/rpa-parser.ts';
import type { Confidence } from '../../packages/rules-core/src/types.ts';

const CORPUS = new URL('../../data/raw/rule-corpus.tsv', import.meta.url);

interface CorpusEntry {
  count: number;
  /** Canonical rule id (PANNEAU_ID_RPA), shared with the build artifacts. */
  id: number;
  description: string;
}

function loadCorpus(): CorpusEntry[] {
  const text = readFileSync(CORPUS, 'utf8');
  return text
    .split('\n')
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [count, id, ...rest] = line.split('\t');
      return {
        count: Number(count),
        id: Number(id),
        description: rest.join('\t'),
      };
    });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const corpus = loadCorpus();
const totalSigns = corpus.reduce((n, e) => n + e.count, 0);

const byConfidence: Record<Confidence, { strings: number; signs: number }> = {
  full: { strings: 0, signs: 0 },
  partial: { strings: 0, signs: 0 },
  none: { strings: 0, signs: 0 },
};

const leftoverFreq = new Map<string, number>();
const failures: Array<{ count: number; description: string; why: string[] }> = [];
const rules: Array<Record<string, unknown>> = [];

for (const entry of corpus) {
  const parsed = parseRpa(entry.description);

  byConfidence[parsed.confidence].strings += 1;
  byConfidence[parsed.confidence].signs += entry.count;

  for (const token of parsed.unparsed ?? []) {
    leftoverFreq.set(token, (leftoverFreq.get(token) ?? 0) + entry.count);
  }

  if (parsed.confidence !== 'full') {
    failures.push({
      count: entry.count,
      description: entry.description,
      why: parsed.unparsed ?? ['no schedule recognised'],
    });
  }

  rules.push({ id: entry.id, ...parsed, signCount: entry.count });
}

const pct = (n: number) => ((n / totalSigns) * 100).toFixed(2);

console.log(`corpus: ${corpus.length} distinct strings, ${totalSigns} signs\n`);
console.log('confidence      strings     signs      share');
for (const level of ['full', 'partial', 'none'] as const) {
  const b = byConfidence[level];
  console.log(
    `  ${level.padEnd(12)} ${String(b.strings).padStart(6)} ${String(b.signs).padStart(9)}   ${pct(b.signs).padStart(6)}%`,
  );
}

const usable = byConfidence.full.signs + byConfidence.partial.signs;
console.log(`\nusable (full + partial): ${pct(usable)}% of signs`);
console.log(`strict (full only):      ${pct(byConfidence.full.signs)}% of signs`);

if (failures.length > 0) {
  console.log('\ntop unresolved strings by sign count:');
  for (const f of failures.sort((a, b) => b.count - a.count).slice(0, 25)) {
    console.log(
      `  ${String(f.count).padStart(6)}  ${f.description.slice(0, 66).padEnd(66)}  ${f.why.slice(0, 3).join(' ')}`,
    );
  }
}

if (leftoverFreq.size > 0) {
  console.log('\nmost frequent unrecognised tokens:');
  for (const [token, n] of [...leftoverFreq].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${String(n).padStart(6)}  ${token}`);
  }
}

const jsonOut = arg('--json');
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rules, null, 2));
  console.log(`\nwrote ${rules.length} rules to ${jsonOut}`);
}

const threshold = Number(arg('--min') ?? '0');
if (threshold > 0 && Number(pct(byConfidence.full.signs)) < threshold) {
  console.error(
    `\nFAIL: strict coverage ${pct(byConfidence.full.signs)}% is below the ${threshold}% threshold`,
  );
  process.exit(1);
}
