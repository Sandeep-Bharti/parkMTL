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
import {
  statusByComboId,
  statusByRuleId,
  type Rule,
  type RuleCombo,
  type Status,
} from '@parkmtl/rules-core';
import { TIME_ZONE } from '@parkmtl/city-montreal';

import { FALLBACK_COLOR, STATUS_COLOR, emphasisFor } from './status-colors.ts';
import { surface } from './theme.ts';

const BASE_SOURCE = 'basemap';
export const DATA_SOURCE = 'parking';

/** Layer ids, exported because hit-testing queries by layer id. */
export const POLE_LAYER = 'poles';
export const BAY_LAYER = 'bays';

/** Below this the dots are noise, and nothing is tappable. */
export const DATA_MIN_ZOOM = 13;

/**
 * Compile an id → value mapping into a `match`, grouped by value.
 *
 * `match` accepts an array of inputs per branch, so two thousand ids sharing
 * seven statuses become seven branches rather than two thousand pairs. The
 * largest group becomes the fallback and is not listed at all. This matters
 * because these expressions are rebuilt and pushed across the bridge on every
 * scrubber movement.
 *
 * MapLibre rejects a `match` with no branches, so a mapping that collapses to a
 * single value degrades to that constant instead.
 */
function matchByValue<T extends string | number>(
  key: string,
  entries: Iterable<[number, T]>,
  fallback: T,
): T | unknown[] {
  const byValue = new Map<T, number[]>();
  for (const [id, value] of entries) {
    const ids = byValue.get(value);
    if (ids) ids.push(id);
    else byValue.set(value, [id]);
  }
  if (byValue.size === 0) return fallback;

  // Whichever value covers the most ids costs nothing as the fallback.
  let commonest = fallback;
  let best = -1;
  for (const [value, ids] of byValue) {
    if (ids.length > best) {
      best = ids.length;
      commonest = value;
    }
  }

  const branches: unknown[] = [];
  for (const [value, ids] of byValue) {
    if (value === commonest) continue;
    branches.push(ids, value);
  }
  if (branches.length === 0) return commonest;

  return ['match', ['get', key], ...branches, commonest];
}

/**
 * Zoom-dependent size, scaled per feature by its emphasis tier.
 *
 * `["zoom"]` is only legal as the input to a *top-level* `interpolate`, so the
 * tier multiplication cannot wrap it — the interpolation goes outside and each
 * stop carries its own per-feature match, repeating the id groups once per
 * stop. With ~10,000 combinations that repetition is the dominant cost of the
 * whole paint object, so the stops are kept to two and only radius pays it:
 * stroke width is uniform, and the dim/bright half of the emphasis rides on
 * `circle-opacity`, which needs no zoom and so is listed once.
 */
function zoomStops(
  stops: Array<[zoom: number, size: number]>,
  outputAt: (size: number) => unknown,
) {
  const expression: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const [zoom, size] of stops) expression.push(zoom, outputAt(size));
  return expression;
}

/** Per-feature sizes for one zoom stop, scaled by each feature's tier. */
function sizedBy(key: string, scales: Map<number, number>, size: number) {
  const scaled = new Map<number, number>();
  for (const [id, scale] of scales) scaled.set(id, +(size * scale).toFixed(2));
  return matchByValue(key, scaled, size);
}

function scaledByZoom(
  key: string,
  scales: Map<number, number>,
  stops: Array<[zoom: number, size: number]>,
) {
  return zoomStops(stops, (size) => sizedBy(key, scales, size));
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
  poleCombos: RuleCombo[],
  bayCombos: RuleCombo[],
  at: Date,
  dark: boolean,
): DataPaint {
  // Both layers now colour by combination, not by rule. A verdict belongs to a
  // place — the most restrictive of every panel on a pole, or every regulation
  // on a bay — and colouring per rule let a pole render green because one
  // panel's window had closed while another forbade parking outright.
  const byRule = statusByRuleId(rules, at, TIME_ZONE);
  const byPole = statusByComboId(byRule, poleCombos);
  const byBay = statusByComboId(byRule, bayCombos);

  const halo = surface(dark).halo;

  /**
   * Availability is drawn twice: once in hue, once in weight. Parking you can
   * use is full size, opaque and haloed; a prohibition is small and dim. That
   * reads as figure against ground before colour is processed, which is what
   * makes the map usable at a glance and legible to a colour-blind driver.
   */
  const tiers = (statuses: Map<number, Status>) => {
    const scale = new Map<number, number>();
    const opacity = new Map<number, number>();
    const stroke = new Map<number, number>();
    for (const [id, status] of statuses) {
      const e = emphasisFor(status);
      scale.set(id, e.scale);
      opacity.set(id, e.opacity);
      stroke.set(id, e.stroke);
    }
    return { scale, opacity, stroke };
  };

  const poleTiers = tiers(byPole);
  const bayTiers = tiers(byBay);

  return {
    poles: {
      'circle-radius': scaledByZoom('comboId', poleTiers.scale, [[13, 3], [18, 10]]),
      'circle-color': matchByValue(
        'comboId',
        [...byPole].map(([id, v]) => [id, STATUS_COLOR[v] ?? FALLBACK_COLOR] as [number, string]),
        FALLBACK_COLOR,
      ),
      'circle-opacity': matchByValue('comboId', poleTiers.opacity, 1),
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0, 18, 1.8],
      'circle-stroke-color': halo,
    },
    bays: {
      'circle-radius': scaledByZoom('comboId', bayTiers.scale, [[13, 2.5], [18, 8]]),
      'circle-color': matchByValue(
        'comboId',
        [...byBay].map(([id, v]) => [id, STATUS_COLOR[v] ?? FALLBACK_COLOR] as [number, string]),
        FALLBACK_COLOR,
      ),
      'circle-opacity': matchByValue('comboId', bayTiers.opacity, 1),
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0, 18, 1.4],
      'circle-stroke-color': halo,
    },
  };
}
