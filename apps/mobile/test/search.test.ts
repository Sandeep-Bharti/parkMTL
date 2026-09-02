import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fold, searchPlaces, type Place } from '../src/search.ts';

const place = (name: string, kind: Place['kind'] = 'street'): Place => ({
  kind,
  name,
  lon: -73.5,
  lat: 45.5,
  zoom: 16,
});

const places = [
  place('Sherbrooke'),
  place('Saint-Denis'),
  place('Sainte-Catherine'),
  place('Peel'),
  place('Le Plateau-Mont-Royal', 'borough'),
  place('Ville-Marie', 'borough'),
];

describe('fold', () => {
  it('strips the accents nobody types', () => {
    assert.equal(fold('Sainte-Catherine'), 'sainte catherine');
    assert.equal(fold('Côte-des-Neiges'), 'cote des neiges');
    assert.equal(fold('Rosemont–La Petite-Patrie'), 'rosemont la petite patrie');
  });
});

describe('searchPlaces', () => {
  it('finds a street by an unaccented prefix', () => {
    const hits = searchPlaces(places, 'sainte cath');
    assert.equal(hits[0]?.name, 'Sainte-Catherine');
  });

  it('ignores punctuation differences', () => {
    assert.equal(searchPlaces(places, 'saint denis')[0]?.name, 'Saint-Denis');
  });

  it('ranks a prefix match above an interior one', () => {
    const hits = searchPlaces([place('De Bleury'), place('Bleury')], 'bleury');
    assert.equal(hits[0]?.name, 'Bleury');
  });

  it('prefers a street over a borough, being the more specific answer', () => {
    const hits = searchPlaces([place('Ville-Marie', 'borough'), place('Ville-Marie')], 'ville');
    assert.equal(hits[0]?.kind, 'street');
  });

  it('stays quiet until the query is worth matching', () => {
    // One letter would match most of the city and rank meaninglessly.
    assert.deepEqual(searchPlaces(places, 's'), []);
    assert.deepEqual(searchPlaces(places, ''), []);
  });

  it('returns nothing rather than guessing when there is no match', () => {
    assert.deepEqual(searchPlaces(places, 'zzzz'), []);
  });
});
