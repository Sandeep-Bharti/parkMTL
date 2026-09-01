/**
 * Validate the map style the app actually hands to MapLibre.
 *
 * The style is generated, not written by hand: its paint properties are
 * compiled from the rule dictionary at runtime. A malformed `match` expression
 * would not fail until the map tried to render, so it is checked here against
 * the MapLibre style specification, using the real artifacts from data/out.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { Rule, RuleCombo } from '../../../packages/rules-core/src/index.ts';
import { buildStyle } from '../../../apps/mobile/src/style.ts';

const DB = fileURLToPath(new URL('../../../data/out/montreal.sqlite', import.meta.url));

function load(): { rules: Rule[]; combos: RuleCombo[] } {
  const db = new DatabaseSync(DB);
  const rules = db
    .prepare('SELECT json FROM rules')
    .all()
    .map((r) => JSON.parse((r as { json: string }).json) as Rule);

  const byCombo = new Map<number, number[]>();
  for (const row of db.prepare('SELECT combo_id, rule_id FROM combo_rules').all()) {
    const { combo_id, rule_id } = row as { combo_id: number; rule_id: number };
    const list = byCombo.get(combo_id) ?? [];
    list.push(rule_id);
    byCombo.set(combo_id, list);
  }
  db.close();

  return { rules, combos: [...byCombo].map(([id, ruleIds]) => ({ id, ruleIds })) };
}

const style = (over: Partial<Parameters<typeof buildStyle>[0]> = {}) =>
  buildStyle({
    baseTilesUrl: 'pmtiles://file:///tmp/base.pmtiles',
    dataTilesUrl: 'pmtiles://file:///tmp/data.pmtiles',
    rules: [],
    combos: [],
    at: new Date('2026-09-07T15:00:00Z'),
    dark: false,
    ...over,
  });

describe('buildStyle', () => {
  it('produces a spec-valid style with an empty dictionary', () => {
    // `match` with no branches is invalid, so the degenerate case must degrade
    // to a flat colour rather than emit a broken expression.
    assert.deepEqual(validateStyleMin(style() as never), []);
  });

  it('names both data layers and points them at the right source layers', () => {
    const s = style() as { layers: Array<{ id: string; 'source-layer'?: string }> };
    const poles = s.layers.find((l) => l.id === 'poles');
    const bays = s.layers.find((l) => l.id === 'bays');
    assert.equal(poles?.['source-layer'], 'poles');
    assert.equal(bays?.['source-layer'], 'bays');
  });

  it('keeps the pmtiles:// URLs fully qualified, as MapLibre Native requires', () => {
    const s = style() as { sources: Record<string, { url: string }> };
    for (const source of Object.values(s.sources)) {
      assert.match(source.url, /^pmtiles:\/\/file:\/\/\//);
    }
  });

  it('renders both themes', () => {
    assert.deepEqual(validateStyleMin(style({ dark: true }) as never), []);
  });
});

// The real dictionary is only present after `npm run build`; skip rather than
// fail so a fresh checkout can still run the suite.
describe('buildStyle with the real dictionary', { skip: !existsSync(DB) }, () => {
  it('compiles ~2,000 rules into a spec-valid style', () => {
    const { rules, combos } = load();
    assert.ok(rules.length > 1000, `expected a full dictionary, got ${rules.length}`);

    const s = style({ rules, combos });
    assert.deepEqual(validateStyleMin(s as never), []);
  });

  it('paints every resolved rule, and keeps a fallback for the rest', () => {
    const { rules, combos } = load();
    const s = style({ rules, combos }) as {
      layers: Array<{ id: string; paint?: Record<string, unknown> }>;
    };

    const expr = s.layers.find((l) => l.id === 'poles')!.paint!['circle-color'] as unknown[];
    assert.equal(expr[0], 'match');
    assert.deepEqual(expr[1], ['get', 'ruleId']);

    // ['match', input, k, v, k, v, …, fallback] — so an odd tail means the
    // fallback is present, which is what stops an unknown id rendering as null.
    assert.equal((expr.length - 3) % 2, 0);
    assert.match(String(expr[expr.length - 1]), /^#[0-9a-f]{6}$/i);
  });
});
