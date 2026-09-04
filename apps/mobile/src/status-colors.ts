import type { Status } from '@parkmtl/rules-core';

import type { Translator } from './i18n.ts';

/**
 * The visual language of the map, and the one place where accessibility is
 * either won or lost.
 *
 * Colour alone cannot carry this. Simulating deuteranopia on a green/red pair
 * collapses both toward the same olive — `#1a7f4b` and `#d1382f` become
 * `#6d6d4d` and `#808021` — so the single most important distinction in the
 * app, *may I park here or not*, would rest on a difference many people cannot
 * see. At a 4-pixel dot it is marginal even with normal vision.
 *
 * So availability is encoded twice over: by hue, and by **weight**. Parking you
 * can use is drawn large, opaque and haloed; parking you cannot is drawn small
 * and dim. That reads as figure against ground before colour is processed at
 * all, and it survives any form of colour blindness.
 */
/**
 * A tradeoff worth recording, because it looks like an oversight otherwise.
 *
 * `free` renders *darker* than `no_parking` under deuteranopia (simulated
 * lightness 0.13 against 0.21), which inverts the "available is brighter"
 * reading. Brightening it to `#2bb36a` fixes that ordering — but drops contrast
 * against the light basemap from 3.98 to 2.00, below the 3.0 floor for a
 * graphical object. The two requirements are contradictory on a pale ground:
 * contrast wants dark, "brightest" wants light.
 *
 * So lightness is not the colour-blind cue here. Size and the halo are, which
 * is why they are tiered as sharply as they are.
 */
export const STATUS_COLOR: Record<Status, string> = {
  free: '#127a45',
  paid: '#1f6fd0',
  limited: '#b87503',
  // Distinctly cooler and lighter than the prohibitions, so "someone may park
  // here, just not you" does not read as "nobody may park here".
  permit_only: '#8b5cc4',
  no_parking: '#d63a2f',
  // Pushed further from no_parking: at dot size the previous pair was only
  // ΔE 21.8 apart, which is not a difference you can act on.
  no_standing: '#6f1410',
  unknown: '#7c828c',
};

/** Painted where a feature's rule is missing from the dictionary entirely. */
export const FALLBACK_COLOR = STATUS_COLOR.unknown;

/**
 * Whether a status means the driver can leave the car here.
 *
 * `unknown` is deliberately *not* available: an unreadable sign must never be
 * drawn with the same confidence as a clear one. It gets its own treatment
 * below — quieter than available, louder than a plain restriction, because it
 * is the one case where the driver has to go and look.
 */
export function isAvailable(status: Status): boolean {
  return status === 'free' || status === 'paid' || status === 'limited';
}

export interface Emphasis {
  /** Multiplier on the base circle radius. */
  scale: number;
  opacity: number;
  /** Halo width multiplier; 0 for no stroke. */
  stroke: number;
}

/**
 * How loudly to draw each status.
 *
 * Three tiers, because availability is not one thing and a prohibition is not
 * noise.
 *
 * The first attempt used two tiers and over-corrected: at `scale 0.62 /
 * opacity 0.55`, prohibitions were 37% of the city's poles but under 3% of the
 * visible ink — they blended into the basemap far enough to stop reading as red
 * at all. For an app whose rule is *never show a restricted spot as clear*,
 * whispering the prohibition is the worse error. They are now clearly legible,
 * and merely subordinate.
 *
 * `free` sits above `paid`/`limited` because downtown is overwhelmingly metered
 * and time-capped; if the two share a tier, the thing people actually hunt for
 * is lost in a field of amber.
 */
export function emphasisFor(status: Status): Emphasis {
  if (status === 'free') return { scale: 1, opacity: 1, stroke: 1 };
  if (isAvailable(status)) return { scale: 0.88, opacity: 0.95, stroke: 0.8 };
  // Never quieter than a plain restriction: an unreadable sign is the one case
  // where the driver has to go and look.
  if (status === 'unknown') return { scale: 0.85, opacity: 0.95, stroke: 0.7 };
  return { scale: 0.78, opacity: 0.82, stroke: 0.35 };
}

export function statusLabel(status: Status, t: Translator): string {
  return t(`status.${status}` as const);
}

/** Every status, ordered for a legend: what you want first. */
export const STATUS_ORDER: Status[] = [
  'free',
  'paid',
  'limited',
  'permit_only',
  'no_parking',
  'no_standing',
  'unknown',
];
