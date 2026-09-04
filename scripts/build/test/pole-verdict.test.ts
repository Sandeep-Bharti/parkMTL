/**
 * The map must never be more permissive than the signs.
 *
 * This is the cardinal rule of the whole project, and it was broken: the tiles
 * carried one feature per *sign*, so a pole with `\P EN TOUT TEMPS` alongside a
 * `\P 6h-12h` whose window had closed drew two dots at one coordinate — a red
 * one and a green one. Available parking is drawn larger than a prohibition, so
 * the green reliably covered the red and the pole read as free parking while
 * parking was forbidden there at all times. About one pole in six.
 *
 * The fix is structural: one feature per pole, carrying a `comboId` for its
 * whole rule set, so the map folds the same way the detail sheet does. These
 * tests assert the property directly against the built database.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  compareStatus,
  mostRestrictive,
  statusByComboId,
  statusByRuleId,
  type Rule,
  type RuleCombo,
  type Status,
} from '../../../packages/rules-core/src/index.ts';
import { TIME_ZONE } from '../../../packages/city-montreal/src/index.ts';

const OUT = fileURLToPath(new URL('../../../data/out/', import.meta.url));
const DB = `${OUT}montreal.sqlite`;
const POLES = `${OUT}poles.geojsonl`;
const built = existsSync(DB) && existsSync(POLES);

function load() {
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
  const combos: RuleCombo[] = [...byCombo].map(([id, ruleIds]) => ({ id, ruleIds }));

  // What each pole's signs actually say, straight from the panel list.
  const signsByPole = new Map<string, number[]>();
  for (const row of db
    .prepare('SELECT pole_id, rule_id FROM signs WHERE is_subpanel = 0')
    .all()) {
    const { pole_id, rule_id } = row as { pole_id: string; rule_id: number };
    const list = signsByPole.get(pole_id) ?? [];
    list.push(rule_id);
    signsByPole.set(pole_id, list);
  }
  db.close();

  // What the tiles will actually draw: pole id -> comboId.
  const drawn = new Map<string, number>();
  for (const line of readFileSync(POLES, 'utf8').split('\n')) {
    if (!line) continue;
    const { properties } = JSON.parse(line) as {
      properties: { pole: string; comboId: number };
    };
    drawn.set(String(properties.pole), properties.comboId);
  }

  return { rules, combos, signsByPole, drawn };
}

describe('what the map draws for a pole', { skip: !built }, () => {
  it('emits exactly one feature per pole', () => {
    // Stacked features are what made the colour depend on draw order.
    const { drawn, signsByPole } = load();
    const lines = readFileSync(POLES, 'utf8').trim().split('\n').length;
    assert.equal(lines, drawn.size, 'every pole should appear exactly once');
    assert.ok(drawn.size > 80_000, `expected the full city, got ${drawn.size}`);
    assert.ok(drawn.size <= signsByPole.size);
  });

  it('never renders a pole more permissively than its signs, at any hour', () => {
    const { rules, combos, signsByPole, drawn } = load();

    for (const hour of [3, 9, 12, 15, 18, 22]) {
      const at = new Date('2026-09-03T00:00:00Z');
      at.setHours(hour, 0, 0, 0);

      const byRule = statusByRuleId(rules, at, TIME_ZONE);
      const byCombo = statusByComboId(byRule, combos);

      let checked = 0;
      for (const [poleId, ruleIds] of signsByPole) {
        const comboId = drawn.get(poleId);
        if (comboId === undefined) continue;

        const rendered = byCombo.get(comboId);
        if (rendered === undefined) continue;

        const truth = mostRestrictive(
          ruleIds.map((id) => byRule.get(id)).filter((s): s is Status => s !== undefined),
        );

        assert.ok(
          compareStatus(rendered, truth) >= 0,
          `pole ${poleId} at ${hour}:00 renders ${rendered} but its signs say ${truth}`,
        );
        checked++;
      }
      assert.ok(checked > 80_000, `expected to check the city, checked ${checked}`);
    }
  });

  it('renders an all-times prohibition as a prohibition even when other panels lapse', () => {
    // The exact shape from the bug report: `\P EN TOUT TEMPS` on a pole whose
    // other panel is a daytime window that has closed by mid-afternoon.
    const { rules, combos, signsByPole, drawn } = load();
    const byId = new Map(rules.map((r) => [r.id, r]));

    const at = new Date('2026-09-03T00:00:00Z');
    at.setHours(15, 31, 0, 0);
    const byCombo = statusByComboId(statusByRuleId(rules, at, TIME_ZONE), combos);

    let found = 0;
    for (const [poleId, ruleIds] of signsByPole) {
      const hasAlways = ruleIds.some((id) => {
        const rule = byId.get(id);
        return rule?.raw.trim().toUpperCase() === '\\P EN TOUT TEMPS';
      });
      if (!hasAlways || ruleIds.length < 2) continue;

      const rendered = byCombo.get(drawn.get(poleId)!);
      assert.ok(
        rendered === 'no_parking' || rendered === 'no_standing' || rendered === 'unknown',
        `pole ${poleId} has \\P EN TOUT TEMPS but renders ${rendered}`,
      );
      found++;
    }
    assert.ok(found > 100, `expected many such poles, found ${found}`);
  });
});
