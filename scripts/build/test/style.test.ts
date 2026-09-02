/**
 * Validate the map style and the paint the app hands to MapLibre.
 *
 * The paint is generated, not written by hand: its colour properties are
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
import {
  BAY_LAYER,
  DATA_MIN_ZOOM,
  DATA_SOURCE,
  POLE_LAYER,
  buildDataPaint,
  buildStyle,
} from '../../../apps/mobile/src/style.ts';

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

const style = (dark = false) =>
  buildStyle({
    baseTilesUrl: 'pmtiles://file:///tmp/base.pmtiles',
    dataTilesUrl: 'pmtiles://file:///tmp/data.pmtiles',
    dark,
  });

const AT = new Date('2026-09-07T15:00:00Z');

/**
 * The app declares the data layers as JSX children, so the spec validator never
 * sees them in the style. Re-attach them here so the paint is still validated
 * exactly as MapLibre will receive it.
 */
function styleWithDataLayers(rules: Rule[], combos: RuleCombo[], dark = false) {
  const base = style(dark);
  const paint = buildDataPaint(rules, combos, AT, dark);
  return {
    ...base,
    layers: [
      ...base.layers,
      {
        id: BAY_LAYER,
        type: 'circle',
        source: DATA_SOURCE,
        'source-layer': 'bays',
        minzoom: DATA_MIN_ZOOM,
        paint: paint.bays,
      },
      {
        id: POLE_LAYER,
        type: 'circle',
        source: DATA_SOURCE,
        'source-layer': 'poles',
        minzoom: DATA_MIN_ZOOM,
        paint: paint.poles,
      },
    ],
  };
}

describe('buildStyle', () => {
  it('produces a spec-valid basemap style', () => {
    assert.deepEqual(validateStyleMin(style() as never), []);
    assert.deepEqual(validateStyleMin(style(true) as never), []);
  });

  it('carries no time-dependent layers, so it never needs rebuilding', () => {
    // Rebuilding the style object tears down every source natively, which is
    // why the data layers live in JSX and this must stay constant.
    const s = style() as { layers: Array<{ id: string }> };
    assert.equal(s.layers.find((l) => l.id === POLE_LAYER), undefined);
    assert.equal(s.layers.find((l) => l.id === BAY_LAYER), undefined);
  });

  it('keeps the pmtiles:// URLs fully qualified, as MapLibre Native requires', () => {
    const s = style() as { sources: Record<string, { url: string }> };
    for (const source of Object.values(s.sources)) {
      assert.match(source.url, /^pmtiles:\/\/file:\/\/\//);
    }
  });
});

describe('buildDataPaint', () => {
  it('degrades to a flat colour when the dictionary is empty', () => {
    // `match` with no branches is invalid, so the degenerate case must not emit
    // an expression at all.
    const paint = buildDataPaint([], [], AT, false);
    assert.match(String(paint.poles['circle-color']), /^#[0-9a-f]{6}$/i);
    assert.deepEqual(validateStyleMin(styleWithDataLayers([], []) as never), []);
  });
});

// The real dictionary is only present after `npm run build`; skip rather than
// fail so a fresh checkout can still run the suite.
describe('buildDataPaint with the real dictionary', { skip: !existsSync(DB) }, () => {
  it('compiles ~2,000 rules into spec-valid paint', () => {
    const { rules, combos } = load();
    assert.ok(rules.length > 1000, `expected a full dictionary, got ${rules.length}`);
    assert.deepEqual(validateStyleMin(styleWithDataLayers(rules, combos) as never), []);
  });

  it('paints every resolved rule, and keeps a fallback for the rest', () => {
    const { rules, combos } = load();
    const expr = buildDataPaint(rules, combos, AT, false).poles['circle-color'] as unknown[];

    assert.equal(expr[0], 'match');
    assert.deepEqual(expr[1], ['get', 'ruleId']);

    // ['match', input, k, v, k, v, …, fallback] — an odd tail means the
    // fallback is present, which is what stops an unknown id rendering as null.
    assert.equal((expr.length - 3) % 2, 0);
    assert.match(String(expr[expr.length - 1]), /^#[0-9a-f]{6}$/i);
  });

  it('repaints to different colours at a different instant', () => {
    // The scrubber's whole premise: the same features, a different verdict.
    const { rules, combos } = load();
    const noon = buildDataPaint(rules, combos, new Date('2026-09-07T16:00:00Z'), false);
    const threeAm = buildDataPaint(rules, combos, new Date('2026-09-07T07:00:00Z'), false);
    assert.notDeepEqual(noon.poles['circle-color'], threeAm.poles['circle-color']);
  });
});
