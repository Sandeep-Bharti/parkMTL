/**
 * Folding many rules onto one feature.
 *
 * A paid bay can be governed by sixteen regulations at once. The map can only
 * match on one integer, so combinations are named and resolved together — and
 * the fold must never report a bay as freer than its strictest active rule.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { statusByComboId, type RuleCombo } from '../src/evaluate.ts';
import type { Status } from '../src/types.ts';

const combos: RuleCombo[] = [
  { id: 0, ruleIds: [1] },
  { id: 1, ruleIds: [1, 2] },
  { id: 2, ruleIds: [] },
];

describe('statusByComboId', () => {
  it('takes the most restrictive member', () => {
    const byRule = new Map<number, Status>([
      [1, 'free'],
      [2, 'no_parking'],
    ]);
    const out = statusByComboId(byRule, combos);
    assert.equal(out.get(0), 'free');
    assert.equal(out.get(1), 'no_parking');
  });

  it('lets unknown outrank everything, so an unreadable rule is never a clear spot', () => {
    const byRule = new Map<number, Status>([
      [1, 'free'],
      [2, 'unknown'],
    ]);
    assert.equal(statusByComboId(byRule, combos).get(1), 'unknown');
  });

  it('ignores informational rules rather than letting them drag the result', () => {
    // Rule 2 is informational, so statusByRuleId leaves it out of the map
    // entirely. The combination must still read as its one real rule.
    const byRule = new Map<number, Status>([[1, 'free']]);
    assert.equal(statusByComboId(byRule, combos).get(1), 'free');
  });

  it('reports a combination with no resolvable rule as unknown', () => {
    assert.equal(statusByComboId(new Map(), combos).get(2), 'unknown');
    assert.equal(statusByComboId(new Map(), combos).get(0), 'unknown');
  });

  it('covers every combination it is given', () => {
    const out = statusByComboId(new Map([[1, 'paid']]), combos);
    assert.deepEqual([...out.keys()].sort(), [0, 1, 2]);
  });
});
