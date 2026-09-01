/**
 * The map style: Protomaps basemap underneath, our parking data on top.
 *
 * The colouring is the whole architecture in one expression. Rules are resolved
 * for an instant in JavaScript — about ten milliseconds for the entire city —
 * and the result is compiled into a MapLibre `match` on each feature's rule id.
 * The GPU does the rest, so there is no per-feature JavaScript and no marker
 * components, and moving through time is just a new expression.
 */

import type {
  DataDrivenPropertyValueSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { statusByComboId, statusByRuleId, type Rule, type RuleCombo } from '@parkmtl/rules-core';
import { TIME_ZONE } from '@parkmtl/city-montreal';

import { FALLBACK_COLOR, STATUS_COLOR } from './status-colors.ts';

const BASE_SOURCE = 'basemap';
const DATA_SOURCE = 'parking';

/**
 * Compile resolved statuses into a paint expression.
 *
 * MapLibre requires at least one branch, and `match` with an empty body is
 * invalid — so a dictionary that somehow resolved to nothing degrades to a flat
 * fallback rather than producing a broken style.
 */
function colorExpression(
  key: string,
  statuses: Map<number, string>,
): DataDrivenPropertyValueSpecification<string> {
  if (statuses.size === 0) return FALLBACK_COLOR;

  const branches: unknown[] = [];
  for (const [id, status] of statuses) {
    branches.push(id, STATUS_COLOR[status as keyof typeof STATUS_COLOR] ?? FALLBACK_COLOR);
  }
  return ['match', ['get', key], ...branches, FALLBACK_COLOR] as unknown as
    DataDrivenPropertyValueSpecification<string>;
}

export interface StyleInput {
  baseTilesUrl: string;
  dataTilesUrl: string;
  rules: Rule[];
  combos: RuleCombo[];
  at: Date;
  dark: boolean;
}

export function buildStyle({
  baseTilesUrl,
  dataTilesUrl,
  rules,
  combos,
  at,
  dark,
}: StyleInput): StyleSpecification {
  const byRule = statusByRuleId(rules, at, TIME_ZONE);
  const byCombo = statusByComboId(byRule, combos);

  const poleColor = colorExpression('ruleId', byRule as Map<number, string>);
  const bayColor = colorExpression('comboId', byCombo as Map<number, string>);

  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${dark ? 'dark' : 'light'}`,
    sources: {
      [BASE_SOURCE]: { type: 'vector', url: baseTilesUrl, attribution: '© OpenStreetMap' },
      [DATA_SOURCE]: {
        type: 'vector',
        url: dataTilesUrl,
        attribution: 'Ville de Montréal; Agence de mobilité durable (CC BY 4.0)',
      },
    },
    layers: [
      ...layers(BASE_SOURCE, namedFlavor(dark ? 'dark' : 'light'), { lang: 'fr' }),

      // Paid bays sit under the signs: a sign governs the whole curb, a bay is
      // one space on it, so the sign is the thing you want on top when they
      // land on the same pixel.
      {
        id: 'bays',
        type: 'circle',
        source: DATA_SOURCE,
        'source-layer': 'bays',
        minzoom: 13,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 5],
          'circle-color': bayColor,
          'circle-opacity': 0.85,
        },
      },
      {
        id: 'poles',
        type: 'circle',
        source: DATA_SOURCE,
        'source-layer': 'poles',
        minzoom: 13,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 16, 6],
          'circle-color': poleColor,
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0, 16, 1],
          'circle-stroke-color': dark ? '#11151c' : '#ffffff',
        },
      },
    ],
  };
}
