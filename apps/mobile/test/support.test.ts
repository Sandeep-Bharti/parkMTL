/**
 * The tip-jar catalogue.
 *
 * Small surface, but two things here are easy to get wrong and invisible when
 * they are: a subscription id that Google Play silently rejects for being too
 * long, and a price shown in the wrong currency because the store's own string
 * was ignored in favour of a hardcoded Canadian one.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALL_PRODUCTS,
  MONTHLY_ID_ANDROID,
  MONTHLY_ID_IOS,
  ONE_TIME_IDS,
  isSubscription,
  metaFor,
  monthlyIdFor,
  monthlyProductsFor,
  priceFor,
} from '../src/support.ts';

describe('catalogue', () => {
  it('offers two one-time tiers and one monthly, per platform', () => {
    assert.equal(ONE_TIME_IDS.length, 2);
    assert.equal(monthlyProductsFor('ios').length, 1);
    assert.equal(monthlyProductsFor('android').length, 1);
  });

  it('names the monthly tier differently on each store', () => {
    assert.equal(monthlyIdFor('ios'), MONTHLY_ID_IOS);
    assert.equal(monthlyIdFor('android'), MONTHLY_ID_ANDROID);
    assert.notEqual(MONTHLY_ID_IOS, MONTHLY_ID_ANDROID);
    // Play is the store with the limit, so its id is the one that must be short.
    assert.ok(MONTHLY_ID_ANDROID.length <= 40);
  });

  it('keeps every product id within Play’s 40-character limit', () => {
    // Play silently refuses longer subscription ids, which is why the monthly
    // tier has a different id per platform.
    for (const product of ALL_PRODUCTS) {
      assert.ok(
        product.id.length <= 40,
        `${product.id} is ${product.id.length} characters`,
      );
    }
  });

  it('namespaces every product under the app bundle id', () => {
    for (const product of ALL_PRODUCTS) {
      assert.match(product.id, /^ca\.parkmtl\.app\./);
    }
  });

  it('recognises only the monthly tier as a subscription', () => {
    assert.equal(isSubscription(MONTHLY_ID_IOS), true);
    // Recognised whichever store it came from, so a restored Android purchase
    // is never finished as a consumable.
    assert.equal(isSubscription(MONTHLY_ID_ANDROID), true);
    assert.equal(isSubscription('ca.parkmtl.app.tip.small'), false);
    assert.equal(isSubscription('something.else'), false);
  });

  it('describes a known product and nothing else', () => {
    assert.equal(metaFor('ca.parkmtl.app.tip.small')?.kind, 'one-time');
    assert.equal(metaFor(MONTHLY_ID_IOS)?.kind, 'monthly');
    assert.equal(metaFor('nope'), undefined);
  });
});

describe('priceFor', () => {
  it('prefers the price the store gave us', () => {
    // The store string carries the buyer's own currency; the fallback is a
    // Canadian figure that would be wrong for everyone outside Canada.
    const price = priceFor('ca.parkmtl.app.tip.small', [
      { id: 'ca.parkmtl.app.tip.small', displayPrice: '3,49 €' },
    ]);
    assert.equal(price, '3,49 €');
  });

  it('falls back rather than showing a blank button', () => {
    assert.equal(priceFor('ca.parkmtl.app.tip.small', []), '$2.99');
    assert.equal(priceFor(MONTHLY_ID_IOS, []), '$4.99');
  });

  it('ignores a store entry with no price', () => {
    const price = priceFor('ca.parkmtl.app.tip.large', [
      { id: 'ca.parkmtl.app.tip.large' },
    ]);
    assert.equal(price, '$14.99');
  });

  it('returns empty for a product it does not know', () => {
    assert.equal(priceFor('nope', []), '');
  });
});
