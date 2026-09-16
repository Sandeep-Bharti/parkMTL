/**
 * About, settings, and the attribution the licence requires.
 *
 * The attribution is not decoration. Both feeds are CC-BY 4.0 and the notice is
 * a condition of shipping the data at all; so is stating that the data may
 * diverge from the street. Neither belongs buried three taps deep, which is why
 * the disclaimer also sits permanently on the map.
 */

import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Language, Translator } from './i18n.ts';
import { elevation, radius, space, surface, type } from './theme.ts';

const SOURCES = [
  {
    label: 'Agence de mobilité durable de Montréal',
    url: 'https://www.agencemobilitedurable.ca/fr/informations/donnees-ouvertes/description-des-donnees-disponibles',
  },
  {
    label: 'Ville de Montréal — Signalisation (stationnement sur rue)',
    url: 'https://donnees.montreal.ca/dataset/stationnement-sur-rue-signalisation-courant',
  },
  { label: 'OpenStreetMap (basemap)', url: 'https://www.openstreetmap.org/copyright' },
];

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'updated'
  | 'not-configured'
  | 'failed';

interface Props {
  t: Translator;
  lang: Language;
  languageOverride: Language | null;
  onLanguage: (lang: Language | null) => void;
  exportDate: string;
  ruleCount: number;
  updateState: UpdateState;
  onCheckUpdates: () => void;
  onOpenSupport: () => void;
  dark: boolean;
  onClose: () => void;
}

export function SettingsSheet({
  t,
  lang,
  languageOverride,
  onLanguage,
  exportDate,
  ruleCount,
  updateState,
  onCheckUpdates,
  onOpenSupport,
  dark,
  onClose,
}: Props) {
  const s = surface(dark);

  const updateLabel =
    updateState === 'checking'
      ? t('settings.checking')
      : updateState === 'up-to-date'
        ? t('settings.upToDate')
        : updateState === 'updated'
          ? t('settings.updated')
          : updateState === 'not-configured'
            ? t('settings.noSource')
            : updateState === 'failed'
              ? t('settings.updateFailed')
              : t('settings.checkUpdates');

  // Once a check has resolved, the button's label becomes a status readout —
  // it stays tappable (to check again), but shouldn't keep looking like a
  // fresh call-to-action once it's reporting something.
  const updateIsStatus = updateState !== 'idle' && updateState !== 'checking';

  return (
    <View style={[styles.sheet, { backgroundColor: s.card }, elevation.high]}>
      <View style={styles.header}>
        <Text style={[type.title, { color: s.text }]}>{t('settings.title')}</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('settings.close')}>
          <Text style={[styles.close, { color: s.textFaint }]}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* First, because it is the one thing here that is a request rather
            than a control — and it is easy to miss further down. */}
        <Pressable
          onPress={onOpenSupport}
          style={[styles.supportRow, { backgroundColor: s.hairline }]}
          accessibilityRole="button"
        >
          <Text style={styles.supportIcon}>☕</Text>
          <View style={styles.supportText}>
            <Text style={[type.label, { color: s.text }]}>{t('support.open')}</Text>
            <Text style={[type.caption, styles.supportHint, { color: s.textDim }]}>
              {t('support.openHint')}
            </Text>
          </View>
          <Text style={[styles.supportChevron, { color: s.textFaint }]}>›</Text>
        </Pressable>

        <Text style={[type.label, styles.sectionLabel, { color: s.textFaint }]}>
          {t('settings.language')}
        </Text>
        <View style={styles.segments}>
          {([null, 'en', 'fr'] as const).map((option) => {
            const selected = languageOverride === option;
            return (
              <Pressable
                key={String(option)}
                onPress={() => onLanguage(option)}
                style={[
                  styles.segment,
                  { backgroundColor: selected ? s.accentStrong : s.hairline },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    type.label,
                    styles.segmentText,
                    { color: selected ? '#ffffff' : s.text },
                  ]}
                >
                  {option === null ? t('settings.system') : option === 'en' ? 'English' : 'Français'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[type.label, styles.sectionLabel, { color: s.textFaint }]}>
          {t('settings.data')}
        </Text>
        <Text style={[type.body, { color: s.text }]}>
          {t('settings.dataVintage', { date: exportDate })} · {ruleCount}
        </Text>
        <Pressable
          onPress={onCheckUpdates}
          disabled={updateState === 'checking'}
          style={[
            styles.button,
            updateIsStatus
              ? { backgroundColor: s.hairline }
              : { backgroundColor: s.accentStrong },
          ]}
        >
          <Text
            style={[
              type.label,
              styles.buttonText,
              { color: updateIsStatus ? s.textDim : '#ffffff' },
            ]}
          >
            {updateLabel}
          </Text>
        </Pressable>

        <Text style={[type.label, styles.sectionLabel, { color: s.textFaint }]}>
          {t('settings.sources')}
        </Text>
        {SOURCES.map((source) => (
          <Pressable key={source.url} onPress={() => Linking.openURL(source.url)}>
            <Text style={[type.label, styles.link, { color: s.accent }]}>{source.label}</Text>
          </Pressable>
        ))}
        <Text style={[type.caption, styles.licence, { color: s.textDim }]}>
          {t('onboard.trust.sources')}
        </Text>

        <View style={styles.legalRow}>
          <Pressable onPress={() => Linking.openURL('https://sandeep-bharti.github.io/parkMTL/privacy.html')}>
            <Text style={[type.label, styles.link, { color: s.accent }]}>
              {t('settings.privacy')}
            </Text>
          </Pressable>
          <Text style={[type.caption, { color: s.textFaint }]}>·</Text>
          <Pressable onPress={() => Linking.openURL('https://sandeep-bharti.github.io/parkMTL/terms.html')}>
            <Text style={[type.label, styles.link, { color: s.accent }]}>
              {t('settings.terms')}
            </Text>
          </Pressable>
        </View>

        <Text style={[type.caption, styles.disclaimer, { color: s.textDim }]}>
          {t('disclaimer.long')}
        </Text>
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
    maxHeight: '72%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.md + 2,
    paddingBottom: space.xl + space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg + 2,
  },
  close: { fontSize: 17, paddingHorizontal: space.xs },
  body: { paddingHorizontal: space.lg + 2, paddingTop: space.sm + 2 },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  supportIcon: { fontSize: 22 },
  supportText: { flex: 1 },
  supportHint: { marginTop: 1 },
  supportChevron: { fontSize: 22, fontWeight: '300' },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: space.lg,
    marginBottom: space.sm - 1,
  },
  segments: { flexDirection: 'row', gap: space.sm },
  segment: {
    minHeight: 44,
    minWidth: 44,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg - 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {},
  button: {
    marginTop: space.sm + 2,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingVertical: space.sm + 1,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    justifyContent: 'center',
  },
  buttonText: {},
  link: { paddingVertical: space.xs, lineHeight: 18 },
  licence: { marginTop: space.sm + 2, lineHeight: 16 },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm - 2, marginTop: space.md },
  disclaimer: {
    marginTop: space.lg + 2,
    marginBottom: space.sm,
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
