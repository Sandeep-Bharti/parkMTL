import type { Status } from '@parkmtl/rules-core';

import type { Translator } from './i18n.ts';

/**
 * One colour per status, and the whole visual language of the app.
 *
 * Green means park here. Amber means you may park but something is limited —
 * a time cap, a meter. Purple means the space is reserved for someone holding a
 * permit. Red means do not. Grey means we could not read the sign, and grey must
 * never be mistaken for green: an unknown curb is one the driver has to check
 * themselves.
 *
 * Chosen to stay distinguishable with deuteranopia, where the green/red pair is
 * carried by lightness as much as hue.
 */
export const STATUS_COLOR: Record<Status, string> = {
  free: '#1a7f4b',
  paid: '#2f6fd0',
  limited: '#c98a04',
  permit_only: '#9a5bd1',
  no_parking: '#d1382f',
  no_standing: '#8f1d16',
  unknown: '#8a8f98',
};

/** Painted where a feature's rule is missing from the dictionary entirely. */
export const FALLBACK_COLOR = STATUS_COLOR.unknown;

export function statusLabel(status: Status, t: Translator): string {
  return t(`status.${status}` as const);
}
