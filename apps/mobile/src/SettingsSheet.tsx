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

  return (
    <View style={[styles.sheet, dark && styles.sheetDark]}>
      <View style={styles.header}>
        <Text style={[styles.title, dark && styles.textDark]}>{t('settings.title')}</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('settings.close')}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* First, because it is the one thing here that is a request rather
            than a control — and it is easy to miss further down. */}
        <Pressable onPress={onOpenSupport} style={styles.supportRow} accessibilityRole="button">
          <Text style={styles.supportIcon}>☕</Text>
          <View style={styles.supportText}>
            <Text style={[styles.supportTitle, dark && styles.textDark]}>
              {t('support.open')}
            </Text>
            <Text style={[styles.supportHint, dark && styles.dimDark]}>
              {t('support.openHint')}
            </Text>
          </View>
          <Text style={styles.supportChevron}>›</Text>
        </Pressable>

        <Text style={[styles.sectionLabel, dark && styles.dimDark]}>
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
                  selected && styles.segmentOn,
                  dark && styles.segmentDark,
                  selected && dark && styles.segmentOnDark,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected && styles.segmentTextOn,
                    dark && !selected && styles.textDark,
                  ]}
                >
                  {option === null ? t('settings.system') : option === 'en' ? 'English' : 'Français'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, dark && styles.dimDark]}>{t('settings.data')}</Text>
        <Text style={[styles.body_, dark && styles.textDark]}>
          {t('settings.dataVintage', { date: exportDate })} · {ruleCount}
        </Text>
        <Pressable
          onPress={onCheckUpdates}
          disabled={updateState === 'checking'}
          style={[styles.button, dark && styles.buttonDark]}
        >
          <Text style={styles.buttonText}>{updateLabel}</Text>
        </Pressable>

        <Text style={[styles.sectionLabel, dark && styles.dimDark]}>
          {t('settings.sources')}
        </Text>
        {SOURCES.map((source) => (
          <Pressable key={source.url} onPress={() => Linking.openURL(source.url)}>
            <Text style={styles.link}>{source.label}</Text>
          </Pressable>
        ))}
        <Text style={[styles.licence, dark && styles.dimDark]}>
          Données : Agence de mobilité durable de Montréal; Ville de Montréal (CC BY 4.0)
        </Text>

        <Text style={[styles.disclaimer, dark && styles.dimDark]}>
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
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 14,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetDark: { backgroundColor: '#161a21' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  title: { fontSize: 18, fontWeight: '700' },
  close: { fontSize: 17, color: '#8a8f98', paddingHorizontal: 4 },
  body: { paddingHorizontal: 18, paddingTop: 10 },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(47,111,208,0.10)',
  },
  supportIcon: { fontSize: 22 },
  supportText: { flex: 1 },
  supportTitle: { fontSize: 15, fontWeight: '600' },
  supportHint: { fontSize: 11, color: '#5b626e', marginTop: 1 },
  supportChevron: { fontSize: 22, color: '#8a8f98', fontWeight: '300' },
  body_: { fontSize: 14 },
  textDark: { color: '#e8eaed' },
  dimDark: { color: '#a2a9b4' },
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#8a8f98',
    marginTop: 16,
    marginBottom: 7,
  },
  segments: { flexDirection: 'row', gap: 8 },
  segment: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#eef1f5',
  },
  segmentDark: { backgroundColor: '#232932' },
  segmentOn: { backgroundColor: '#2f6fd0' },
  segmentOnDark: { backgroundColor: '#2f6fd0' },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#3c4250' },
  segmentTextOn: { color: '#ffffff' },
  button: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2f6fd0',
  },
  buttonDark: { backgroundColor: '#2f6fd0' },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  link: { fontSize: 13, color: '#2f6fd0', paddingVertical: 4, lineHeight: 18 },
  licence: { fontSize: 11, color: '#5b626e', marginTop: 10, lineHeight: 16 },
  disclaimer: {
    fontSize: 12,
    color: '#5b626e',
    marginTop: 18,
    marginBottom: 8,
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
