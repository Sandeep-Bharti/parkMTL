# Setting up the tip jar

The in-app contributions follow the same shape as the Ekadashi app: `expo-iap`,
no RevenueCat, no backend, no API keys. StoreKit 2 on iOS, Play Billing on
Android, with the connection managed by the `useIAP()` hook.

**Nothing a contribution buys unlocks anything.** That is stated in the code, in
the UI, and here, because it is the property that keeps the app trustworthy: no
one should be able to argue they paid for an accuracy promise.

## Products

| id | type | price |
|---|---|---|
| `ca.parkmtl.app.tip.small` | Consumable | $2.99 |
| `ca.parkmtl.app.tip.large` | Consumable | $14.99 |
| `ca.parkmtl.app.support.monthly` | Auto-renewable, `P1M`, group "Support" | $4.99 |

One-time tiers are **consumables**, not non-consumables, so someone who wants to
give twice can.

**Android uses a different id for the monthly tier** —
`ca.parkmtl.app.sub.monthly` — because Google Play caps subscription ids at 40
characters and the iOS id is over it. See `monthlyIdFor` in
[apps/mobile/src/support.ts](../apps/mobile/src/support.ts); `isSubscription`
recognises both, so a restored Android purchase is never finished as a
consumable.

## Testing locally — no developer account needed

[apps/mobile/parkmtl.storekit](../apps/mobile/parkmtl.storekit) drives StoreKit 2
in the simulator. It is attached to the Run scheme automatically by
[plugins/withStoreKitConfig.js](../apps/mobile/plugins/withStoreKitConfig.js),
so it survives `expo prebuild --clean` — that reference lives inside the
generated `ios/` directory and is otherwise destroyed on every prebuild.

**The configuration only applies when the app is launched from Xcode.** Running
`xcrun simctl launch` bypasses the scheme, so no products load and the sheet
falls back to its hardcoded prices. To exercise real purchases:

1. `open ios/parkmtl.xcworkspace`
2. Run (⌘R) on a simulator.
3. Debug → StoreKit → Manage Transactions to inspect, refund or reset purchases
   between attempts.

## App Store Connect

1. Create the three products with the ids above, matching the types exactly.
2. **Sign the Paid Applications Agreement.** Until it is active, products simply
   do not load — with no error explaining why. This is the most common reason an
   otherwise-correct tip jar shows nothing.
3. Add a localized display name and description per product.
4. Create a sandbox tester under Users and Access, and sign in on the device
   under Settings → App Store → Sandbox Account.

Products stay in "Ready to Submit" until an app version is submitted alongside
them; they still work in sandbox before that.

## Play Console

1. Monetise → Products → In-app products for the two consumables.
2. Monetise → Products → Subscriptions for the monthly tier, using the **short**
   id, with a base plan set to monthly auto-renewing.
3. Activate each product — Play defaults them to inactive, and an inactive
   product is simply absent from the query results.
4. Upload a build to a closed or internal track first; Play does not return
   products for an app with no published build.

## What is verified, and what is not

Verified here: the app builds with `expo-iap`, the sheet renders in both
languages and themes, the catalogue and price-fallback logic are covered by
tests, and the StoreKit reference survives a clean prebuild.

**Not verified:** real products, real payments, subscription renewal, and
anything on Play. Those need the paid developer accounts that Phase 7 is already
blocked on — see [release.md](release.md).
