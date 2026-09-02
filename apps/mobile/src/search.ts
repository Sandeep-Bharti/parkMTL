/**
 * Finding a place by name.
 *
 * A real limitation to be honest about: the signage feed carries a borough for
 * every pole but a street name for almost none of them, so only streets that
 * have *paid* parking (430 of them) can be found by name. Everywhere else is
 * reachable by borough. Pretending otherwise would mean a search box that
 * silently fails on most of the city.
 */

import type * as SQLite from 'expo-sqlite';

export interface Place {
  kind: 'street' | 'borough';
  name: string;
  lon: number;
  lat: number;
  /** How tight to zoom: a street is a corridor, a borough is a region. */
  zoom: number;
}

/**
 * Strip accents and case so "Sainte-Catherine" is found by "sainte catherine".
 * Montreal street names are full of diacritics and nobody types them.
 */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Load the searchable gazetteer once.
 *
 * Both queries aggregate to a centroid, which is the right target for a
 * camera: a street's paid bays cluster along it, and a borough's poles fill it.
 */
export async function loadPlaces(db: SQLite.SQLiteDatabase): Promise<Place[]> {
  const streets = await db.getAllAsync<{ name: string; lon: number; lat: number }>(
    `SELECT street AS name, AVG(lon) AS lon, AVG(lat) AS lat
       FROM spaces
      WHERE street IS NOT NULL AND street <> ''
      GROUP BY street`,
  );

  const boroughs = await db.getAllAsync<{ name: string; lon: number; lat: number }>(
    `SELECT borough AS name, AVG(lon) AS lon, AVG(lat) AS lat
       FROM poles
      WHERE borough IS NOT NULL AND borough <> ''
      GROUP BY borough`,
  );

  return [
    ...streets.map((s) => ({ kind: 'street' as const, ...s, zoom: 16 })),
    ...boroughs.map((b) => ({ kind: 'borough' as const, ...b, zoom: 13.5 })),
  ];
}

/**
 * Rank matches so the most useful one is first.
 *
 * A prefix match beats a match in the middle — someone typing "sher" wants
 * Sherbrooke, not "rue de Sherbrooke Est" ranked below something that merely
 * contains the letters.
 */
export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
  const needle = fold(query);
  if (needle.length < 2) return [];

  const scored: Array<{ place: Place; score: number }> = [];
  for (const place of places) {
    const hay = fold(place.name);
    const at = hay.indexOf(needle);
    if (at === -1) continue;

    // Lower is better: prefix beats interior, shorter names beat longer ones,
    // and a street beats a borough because it is the more specific answer.
    const score = at * 10 + hay.length / 100 + (place.kind === 'borough' ? 5 : 0);
    scored.push({ place, score });
  }

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.place);
}
