/**
 * The tip jar.
 *
 * **No purchase unlocks or gates anything.** Every feature is free, there are no
 * ads and no tracking, and that stays true whether or not anyone contributes.
 * This matters beyond generosity: the app is guidance, not a guarantee, and
 * nobody should be able to argue they paid for an accuracy promise.
 *
 * One-time contributions are *consumables* rather than non-consumables, so
 * someone who wants to give twice can. The monthly tier is an auto-renewable
 * subscription in a group of its own.
 *
 * Free of native imports so the catalogue and its helpers stay testable.
 */

export type ProductKind = 'one-time' | 'monthly';

export interface SupportProduct {
  id: string;
  kind: ProductKind;
  /** Shown until the store returns a localized price, or if it never does. */
  fallbackPrice: string;
  /** i18n key for the tier's label. */
  labelKey: 'support.tipSmall' | 'support.tipLarge' | 'support.monthly';
}

/**
 * Google Play caps subscription product ids at 40 characters, so the two stores
 * name the same tier differently.
 *
 * Taken as a parameter rather than read from `Platform`, so this module stays
 * free of native imports and testable under plain Node — the same discipline
 * that `manifest.ts` and `installed.ts` follow.
 */
export const MONTHLY_ID_IOS = 'ca.parkmtl.app.support.monthly';
export const MONTHLY_ID_ANDROID = 'ca.parkmtl.app.sub.monthly';

export function monthlyIdFor(os: string): string {
  return os === 'android' ? MONTHLY_ID_ANDROID : MONTHLY_ID_IOS;
}

export const ONE_TIME_PRODUCTS: SupportProduct[] = [
  {
    id: 'ca.parkmtl.app.tip.small',
    kind: 'one-time',
    fallbackPrice: '$2.99',
    labelKey: 'support.tipSmall',
  },
  {
    id: 'ca.parkmtl.app.tip.large',
    kind: 'one-time',
    fallbackPrice: '$14.99',
    labelKey: 'support.tipLarge',
  },
];

const monthly = (id: string): SupportProduct => ({
  id,
  kind: 'monthly',
  fallbackPrice: '$4.99',
  labelKey: 'support.monthly',
});

export function monthlyProductsFor(os: string): SupportProduct[] {
  return [monthly(monthlyIdFor(os))];
}

export const ONE_TIME_IDS = ONE_TIME_PRODUCTS.map((p) => p.id);

/** Both platforms' ids, so metadata lookup never depends on where it runs. */
export const ALL_PRODUCTS: SupportProduct[] = [
  ...ONE_TIME_PRODUCTS,
  monthly(MONTHLY_ID_IOS),
  monthly(MONTHLY_ID_ANDROID),
];

export function isSubscription(id: string): boolean {
  return id === MONTHLY_ID_IOS || id === MONTHLY_ID_ANDROID;
}

export function metaFor(id: string): SupportProduct | undefined {
  return ALL_PRODUCTS.find((p) => p.id === id);
}

/** A product as the store described it, or as little as we know about it. */
export interface StoreProduct {
  id: string;
  displayPrice?: string;
}

/**
 * The price to show for a tier.
 *
 * The store's own string is always preferred — it carries the right currency
 * and formatting for the buyer's storefront, which a hardcoded Canadian figure
 * would get wrong for everyone else. The fallback exists only so the sheet is
 * never blank while the store is loading, or if it never answers.
 */
export function priceFor(id: string, storeProducts: StoreProduct[]): string {
  const fromStore = storeProducts.find((p) => p.id === id)?.displayPrice;
  if (fromStore) return fromStore;
  return metaFor(id)?.fallbackPrice ?? '';
}
