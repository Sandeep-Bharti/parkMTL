/**
 * The tip jar, and the promise that comes with it.
 *
 * The most important thing on this screen is not the buttons — it is the line
 * saying contributions unlock nothing. An app that shows people where they may
 * park has to be trusted, and the fastest way to lose that is to let someone
 * suspect the free version is the degraded one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Text,
  View,
} from 'react-native';
import { ErrorCode, useIAP } from 'expo-iap';

import type { Translator } from './i18n.ts';
import {
  ONE_TIME_IDS,
  ONE_TIME_PRODUCTS,
  isSubscription,
  monthlyProductsFor,
  priceFor,
  type StoreProduct,
} from './support.ts';
import { elevation, radius, space, surface, type } from './theme.ts';

interface Props {
  t: Translator;
  dark: boolean;
  onClose: () => void;
}

/** Shares the one busyId flag with buy(), so a purchase and a restore
 * correctly disable each other instead of racing on two independent flags. */
const RESTORE_ID = '__restore__';

export function SupportSheet({ t, dark, onClose }: Props) {
  const s = surface(dark);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Set true only while our own restore() call is in flight, so the effect
  // below reacts to the resulting state change but not to unrelated ones
  // (e.g. a fresh purchase updating the same arrays).
  const restoring = useRef(false);

  const monthlyProducts = monthlyProductsFor(Platform.OS);
  const monthlyIds = monthlyProducts.map((p) => p.id);

  const {
    connected,
    products,
    subscriptions,
    activeSubscriptions,
    availablePurchases,
    fetchProducts,
    getActiveSubscriptions,
    requestPurchase,
    finishTransaction,
    restorePurchases,
  } = useIAP({
    onPurchaseSuccess: async (purchase: unknown) => {
      const p = purchase as { productId?: string; id?: string };
      const productId = p.productId ?? p.id ?? '';
      try {
        // Consumables must be finished as consumable, or they cannot be
        // bought a second time by someone who wants to give again.
        await finishTransaction({
          purchase: purchase as never,
          isConsumable: !isSubscription(productId),
        });
      } catch {
        // Already finished — harmless, and not worth telling anyone about.
      }
      setBusyId(null);
      Alert.alert(t('support.thanks'), t('support.thanksBody'));
    },
    onPurchaseError: (error: { code?: string; message?: string }) => {
      setBusyId(null);
      // Cancelling is a decision, not a failure. Saying nothing is correct.
      if (error.code === ErrorCode.UserCancelled) return;
      if (error.code === ErrorCode.AlreadyOwned) {
        Alert.alert(t('support.alreadyOwned'), t('support.alreadyOwnedBody'));
        return;
      }
      Alert.alert(t('support.failed'), error.message ?? t('support.failedBody'));
    },
  });

  useEffect(() => {
    if (!connected) return;
    // Errors are swallowed on purpose: an unreachable store leaves the
    // fallback prices showing, which is a better screen than an alert nobody
    // asked for on a page they opened to be generous.
    fetchProducts({ skus: ONE_TIME_IDS, type: 'in-app' }).catch(() => {});
    fetchProducts({ skus: monthlyIds, type: 'subs' }).catch(() => {});
    // So a returning supporter sees the "already supporting" state on open,
    // not only right after a fresh purchase or an explicit restore.
    getActiveSubscriptions(monthlyIds).catch(() => {});
  }, [connected]);

  // Once restore() resolves, restorePurchasesInternal has already updated
  // availablePurchases — react to that instead of trusting our own stale
  // closure over it from before the await.
  useEffect(() => {
    if (!restoring.current) return;
    restoring.current = false;
    setBusyId(null);
    const found = availablePurchases.length > 0 || activeSubscriptions.length > 0;
    Alert.alert(
      found ? t('support.restoreDone') : t('support.restoreEmpty'),
      found ? t('support.restoreDoneBody') : t('support.restoreEmptyBody'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePurchases, activeSubscriptions]);

  const isSubscribed = activeSubscriptions.some(
    (sub) => sub.isActive && monthlyIds.includes(sub.productId),
  );

  const store: StoreProduct[] = [
    ...((products ?? []) as StoreProduct[]),
    ...((subscriptions ?? []) as StoreProduct[]),
  ];

  const buy = useCallback(
    async (id: string, kind: 'in-app' | 'subs') => {
      if (!connected) {
        Alert.alert(t('support.failed'), t('support.unavailable'));
        return;
      }
      setBusyId(id);
      try {
        const sub = subscriptions?.find(
          (p: unknown) => (p as { id: string }).id === id,
        ) as { subscriptionOfferDetailsAndroid?: Array<{ offerToken: string }> } | undefined;
        const offerToken = sub?.subscriptionOfferDetailsAndroid?.[0]?.offerToken;

        await requestPurchase({
          request: {
            ios: { sku: id },
            android: {
              skus: [id],
              subscriptionOffers: offerToken ? [{ sku: id, offerToken }] : [],
            },
          },
          type: kind,
        } as never);
      } catch (e) {
        const error = e as { code?: string; message?: string };
        if (error.code === ErrorCode.UserCancelled) {
          return;
        }
        if (error.code === ErrorCode.AlreadyOwned) {
          Alert.alert(t('support.alreadyOwned'), t('support.alreadyOwnedBody'));
          return;
        }
        Alert.alert(t('support.failed'), error.message ?? t('support.failedBody'));
      } finally {
        // Ekadashi's version only cleared this in the callbacks, so a purchase
        // that resolved without firing one left the button spinning for good.
        setBusyId(null);
      }
    },
    [connected, requestPurchase, subscriptions, t],
  );

  const restore = useCallback(async () => {
    if (busyId !== null) return;
    setBusyId(RESTORE_ID);
    try {
      restoring.current = true;
      await restorePurchases();
      // Success is reported by the effect above, once availablePurchases/
      // activeSubscriptions actually reflect what restorePurchases found.
    } catch {
      restoring.current = false;
      setBusyId(null);
      Alert.alert(t('support.restoreFailed'), t('support.failedBody'));
    }
  }, [busyId, restorePurchases, t]);

  return (
    <View style={[styles.sheet, { backgroundColor: s.card }, elevation.high]}>
      <View style={styles.header}>
        <Text style={[type.title, { color: s.text }]}>{t('support.title')}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('sheet.close')}
        >
          <Text style={[styles.close, { color: s.textFaint }]}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* The point of the whole screen. */}
        <View style={[styles.reassure, { borderColor: s.hairline }]}>
          <Text style={[type.label, { color: s.text }]}>{t('support.freeTitle')}</Text>
          <Text style={[type.caption, styles.lead, { color: s.textDim }]}>
            {t('support.freeBody')}
          </Text>
        </View>

        <Text style={[type.label, styles.section, { color: s.text }]}>
          {t('support.oneTimeTitle')}
        </Text>
        <Text style={[type.caption, { color: s.textFaint }]}>
          {t('support.oneTimeCaption')}
        </Text>
        <View style={styles.tierRow}>
          {ONE_TIME_PRODUCTS.map((product) => (
            <Pressable
              key={product.id}
              onPress={() => buy(product.id, 'in-app')}
              disabled={busyId !== null}
              style={[styles.tier, { backgroundColor: s.accentStrong }]}
              accessibilityRole="button"
              accessibilityLabel={`${t(product.labelKey)} ${priceFor(product.id, store)}`}
            >
              {busyId === product.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={[type.title, styles.tierPrice]}>
                    {priceFor(product.id, store)}
                  </Text>
                  <Text style={[type.caption, styles.tierLabel]}>{t(product.labelKey)}</Text>
                </>
              )}
            </Pressable>
          ))}
        </View>

        {monthlyProducts.map((product) => (
          <Pressable
            key={product.id}
            onPress={() => buy(product.id, 'subs')}
            disabled={busyId !== null || isSubscribed}
            style={[styles.monthly, { borderColor: s.hairline }]}
            accessibilityRole="button"
            accessibilityLabel={
              isSubscribed
                ? t('support.activeSupporter')
                : `${t('support.monthlyTitle')} ${t('support.perMonth', {
                    price: priceFor(product.id, store),
                  })}`
            }
          >
            <View style={styles.monthlyText}>
              <Text style={[type.label, { color: s.text }]}>
                {t('support.monthlyTitle')}
              </Text>
              <Text style={[type.caption, { color: s.textFaint }]}>
                {isSubscribed ? t('support.activeSupporter') : t('support.monthlyCaption')}
              </Text>
            </View>
            {isSubscribed ? (
              <Text style={[type.title, styles.monthlyPrice, { color: s.accent }]}>✓</Text>
            ) : busyId === product.id ? (
              <ActivityIndicator color={s.accent} />
            ) : (
              <Text style={[type.title, styles.monthlyPrice, { color: s.accent }]}>
                {t('support.perMonth', { price: priceFor(product.id, store) })}
              </Text>
            )}
          </Pressable>
        ))}

        <Pressable
          onPress={restore}
          disabled={busyId !== null}
          style={styles.restore}
          accessibilityRole="button"
        >
          {busyId === RESTORE_ID ? (
            <ActivityIndicator color={s.accent} />
          ) : (
            <>
              <Text style={[type.label, { color: s.accent }]}>{t('support.restore')}</Text>
              <Text style={[type.caption, { color: s.textFaint }]}>
                {t('support.restoreHint')}
              </Text>
            </>
          )}
        </Pressable>

        {/* The data is public and free; contributions must not look like a fee
            for it. */}
        <Text style={[type.micro, styles.note, { color: s.textFaint }]}>
          {t('support.dataNote')}
        </Text>

        <Pressable
          onPress={() => Linking.openURL('https://donnees.montreal.ca/')}
          accessibilityRole="link"
        >
          <Text style={[type.micro, { color: s.accent }]}>donnees.montreal.ca</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  close: { fontSize: 17, paddingHorizontal: space.xs },
  body: { paddingHorizontal: space.lg, paddingTop: space.md },
  reassure: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
  },
  lead: { marginTop: space.xs, lineHeight: 18 },
  section: { marginTop: space.xl },
  tierRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  tier: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  tierPrice: { color: '#fff' },
  tierLabel: { color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  monthly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.lg,
  },
  monthlyText: { flex: 1, gap: 1 },
  monthlyPrice: {},
  restore: { marginTop: space.xl, gap: 1 },
  note: { marginTop: space.xl, lineHeight: 15 },
});
