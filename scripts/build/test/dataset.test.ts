/**
 * Tests for the shared dataset layer.
 *
 * The important property here is id *stability*: the rule id has to survive the
 * upstream CSV being reordered, because tiles and dictionary are downloaded
 * separately and a shifted id would mis-colour the city rather than fail.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AMD_ID_BASE,
  amdRuleIds,
  buildPoles,
  buildRuleDict,
  ruleIdOf,
  signCounts,
  type Row,
} from '../../ingest/dataset.ts';

function row(over: Partial<Row> = {}): Row {
  return {
    POTEAU_ID_POT: '41',
    POSITION_POP: '1',
    PANNEAU_ID_RPA: '2413',
    DESCRIPTION_RPA: '\\P EN TOUT TEMPS',
    CODE_RPA: 'SD-TT',
    FLECHE_PAN: '2',
    DESCRIPTION_CAT: 'STATIONNEMENT',
    DESCRIPTION_REP: 'Réel',
    Longitude: '-73.54696',
    Latitude: '45.574396',
    NOM_ARROND: 'Mercier - Hochelaga-Maisonneuve',
    ...over,
  };
}

describe('buildRuleDict', () => {
  it('uses the city PANNEAU_ID_RPA as the rule id', () => {
    const rules = buildRuleDict([row({ PANNEAU_ID_RPA: '2413' })]);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].id, 2413);
    assert.equal(rules[0].action, 'no_parking');
  });

  it('is stable when the upstream rows are reordered', () => {
    const rows = [
      row({ PANNEAU_ID_RPA: '11', DESCRIPTION_RPA: '\\A EN TOUT TEMPS' }),
      row({ PANNEAU_ID_RPA: '2413', DESCRIPTION_RPA: '\\P EN TOUT TEMPS' }),
      row({ PANNEAU_ID_RPA: '77', DESCRIPTION_RPA: 'P 2H 9H-18H LUN A VEN' }),
    ];

    const forward = buildRuleDict(rows).map((r) => [r.id, r.raw]);
    const reversed = buildRuleDict([...rows].reverse()).map((r) => [r.id, r.raw]);

    assert.deepEqual(forward, reversed);
  });

  it('deduplicates repeated ids without renumbering', () => {
    const rules = buildRuleDict([row(), row(), row({ PANNEAU_ID_RPA: '11' })]);
    assert.deepEqual(
      rules.map((r) => r.id),
      [11, 2413],
    );
  });

  it('skips rows whose id is not an integer', () => {
    assert.deepEqual(buildRuleDict([row({ PANNEAU_ID_RPA: '' })]), []);
  });
});

describe('buildPoles', () => {
  it('groups signs onto one pole', () => {
    const poles = buildPoles([row({ POSITION_POP: '1' }), row({ POSITION_POP: '2' })]);
    assert.equal(poles.size, 1);
    assert.equal(poles.get('41')!.signs.length, 2);
    assert.equal(poles.get('41')!.borough, 'Mercier - Hochelaga-Maisonneuve');
  });

  it('drops rows with unusable coordinates', () => {
    assert.equal(buildPoles([row({ Longitude: '' })]).size, 0);
    assert.equal(buildPoles([row({ Latitude: 'n/a' })]).size, 0);
  });
});

describe('signCounts', () => {
  it('counts signs per rule id', () => {
    const counts = signCounts([row(), row(), row({ PANNEAU_ID_RPA: '11' })]);
    assert.equal(counts.get(2413), 2);
    assert.equal(counts.get(11), 1);
  });
});

describe('amdRuleIds', () => {
  it('numbers codes from the AMD base, clear of signage ids', () => {
    const ids = amdRuleIds(['CH-AA', 'AM-HP']);
    assert.equal(ids.get('AM-HP'), AMD_ID_BASE);
    assert.equal(ids.get('CH-AA'), AMD_ID_BASE + 1);
  });

  it('is order-independent and deduplicates', () => {
    assert.deepEqual(
      [...amdRuleIds(['B', 'A', 'B'])],
      [...amdRuleIds(['A', 'B'])],
    );
  });
});

describe('ruleIdOf', () => {
  it('reads the canonical id off a row', () => {
    assert.equal(ruleIdOf(row({ PANNEAU_ID_RPA: '17021' })), 17021);
  });
});
