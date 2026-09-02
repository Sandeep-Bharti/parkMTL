/**
 * The map style and the paint that colours it.
 *
 * The colouring is the whole architecture in one expression. Rules are resolved
 * for an instant in JavaScript — well under a millisecond for the entire city —
 * and the result is compiled into a MapLibre `match` on each feature's rule id.
 * The GPU does the rest, so there is no per-feature JavaScript and no marker
 * components, and moving through time is just a new expression.
 *
 * The basemap style and the data layers are built separately on purpose.
 * `Map` stringifies `mapStyle` and the native side tears down every source when
 * that string changes, so recolouring by rebuilding the style would reload the
 * whole map on every scrubber tick — dropped sources, refetched glyphs, visible
 * flicker. The style below is therefore constant, and the data layers are JSX
 * whose `paint` prop changes in place.
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
export const DATA_SOURCE = 'parking';

/** Layer ids, exported because hit-testing queries by layer id. */
export const POLE_LAYER = 'poles';
export const BAY_LAYER = 'bays';

/** Below this the dots are noise, and nothing is tappable. */
export const DATA_MIN_ZOOM = 13;

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
  dark: boolean;
  /**
   * Language for the basemap's own labels. Follows the app language: an English
   * interface over a French map reads as a half-finished translation.
   *
   * Street names stay as they are — "Avenue Van Horne" is the street's name,
   * not a French rendering of it — but everything the basemap does localise
   * (place names with a `name:en`, POI categories) follows this.
   */
  lang: string;
}

/**
 * The basemap and the two vector sources. Free of anything that changes with
 * *time*, so the scrubber never replaces it.
 *
 * Language and theme do change it, and each change costs a native style reload.
 * That is acceptable for settings someone toggles occasionally; it would not be
 * for something dragged.
 */
export function buildStyle({
  baseTilesUrl,
  dataTilesUrl,
  dark,
  lang,
}: StyleInput): StyleSpecification {
  return {
    version: 8,
    // NOT yet offline: the tiles are local but label glyphs and sprites are
    // still fetched over HTTP, so a cold start with no connection draws the
    // map without text. Bundling the glyph ranges is outstanding work — see
    // the Phase 5 attribution/i18n pass, which has to touch fonts anyway.
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
    layers: [...layers(BASE_SOURCE, namedFlavor(dark ? 'dark' : 'light'), { lang })],
  };
}

export interface DataPaint {
  poles: Record<string, unknown>;
  bays: Record<string, unknown>;
}

/**
 * Paint for both data layers at one instant.
 *
 * Called on every scrubber movement, so it must stay cheap: resolving the whole
 * dictionary plus every rule combination is a few thousand map operations.
 */
export function buildDataPaint(
  rules: Rule[],
  combos: RuleCombo[],
  at: Date,
  dark: boolean,
): DataPaint {
  const byRule = statusByRuleId(rules, at, TIME_ZONE);
  const byCombo = statusByComboId(byRule, combos);

  return {
    poles: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 16, 6, 18, 9],
      'circle-color': colorExpression('ruleId', byRule as Map<number, string>),
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0, 16, 1],
      'circle-stroke-color': dark ? '#11151c' : '#ffffff',
    },
    bays: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 5, 18, 7],
      'circle-color': colorExpression('comboId', byCombo as Map<number, string>),
      'circle-opacity': 0.85,
    },
  };
}
