/**
 * The one time this app is allowed to explain itself.
 *
 * Three things a driver needs before the map means anything: what the colours
 * say, that the street overrules the app, and why it wants their location. Made
 * once, properly — which is what buys back the screen the old permanent
 * disclaimer bar was occupying, shouting quietly forever.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Status } from '@parkmtl/rules-core';

import { STATUS_COLOR, emphasisFor, statusLabel } from './status-colors.ts';
import type { Translator } from './i18n.ts';
import { elevation, radius, space, surface, type } from './theme.ts';

/** Shown in the legend card, grouped the way the map draws them. */
const AVAILABLE: Status[] = ['free', 'paid', 'limited'];
const RESTRICTED: Status[] = ['permit_only', 'no_parking', 'no_standing'];

interface Props {
  t: Translator;
  dark: boolean;
  onDone: (allowLocation: boolean) => void;
}

export function Onboarding({ t, dark, onDone }: Props) {
  const [step, setStep] = useState(0);
  const s = surface(dark);

  const dot = (status: Status) => {
    const e = emphasisFor(status);
    const size = 16 * e.scale;
    return (
      <View key={status} style={styles.legendRow}>
        <View style={styles.dotCell}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: STATUS_COLOR[status],
              opacity: e.opacity,
              borderWidth: e.stroke > 0 ? 2 : 0,
              borderColor: s.halo,
            }}
          />
        </View>
        <Text style={[type.body, { color: s.text }]}>{statusLabel(status, t)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: s.card }, elevation.high]}>
        {step === 0 && (
          <>
            <Text style={[type.verdict, { color: s.text }]}>{t('onboard.colours.title')}</Text>
            <Text style={[type.body, styles.lead, { color: s.textDim }]}>
              {t('onboard.colours.body')}
            </Text>
            <View style={styles.group}>{AVAILABLE.map(dot)}</View>
            <Text style={[type.micro, { color: s.textFaint, marginTop: space.sm }]}>
              {t('onboard.colours.restricted')}
            </Text>
            <View style={styles.group}>{RESTRICTED.map(dot)}</View>
            <View style={styles.group}>{dot('unknown')}</View>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={[type.verdict, { color: s.text }]}>{t('onboard.trust.title')}</Text>
            <Text style={[type.body, styles.lead, { color: s.textDim }]}>
              {t('onboard.trust.body')}
            </Text>
            <Text style={[type.caption, styles.lead, { color: s.textFaint }]}>
              {t('onboard.trust.sources')}
            </Text>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={[type.verdict, { color: s.text }]}>{t('onboard.location.title')}</Text>
            <Text style={[type.body, styles.lead, { color: s.textDim }]}>
              {t('onboard.location.body')}
            </Text>
          </>
        )}

        <View style={styles.footer}>
          <View style={styles.pips}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.pip,
                  { backgroundColor: i === step ? s.accent : s.hairline },
                ]}
              />
            ))}
          </View>

          {step < 2 ? (
            <Pressable onPress={() => setStep(step + 1)} style={[styles.button, { backgroundColor: s.accent }]}>
              <Text style={styles.buttonText}>{t('onboard.next')}</Text>
            </Pressable>
          ) : (
            <View style={styles.finalButtons}>
              <Pressable onPress={() => onDone(false)} hitSlop={8}>
                <Text style={[type.label, { color: s.textFaint }]}>{t('onboard.notNow')}</Text>
              </Pressable>
              <Pressable onPress={() => onDone(true)} style={[styles.button, { backgroundColor: s.accent }]}>
                <Text style={styles.buttonText}>{t('onboard.allow')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    padding: space.xl,
  },
  lead: { marginTop: space.sm, lineHeight: 21 },
  group: { marginTop: space.sm, gap: space.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dotCell: { width: 20, alignItems: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
  },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { width: 7, height: 7, borderRadius: 4 },
  button: {
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
  },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  finalButtons: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
});
