/**
 * What the signs on one pole (or one paid bay) actually mean, right now.
 *
 * The verdict is the headline, but the sign text is the authority — the app is
 * guidance and the street is not. So the literal `DESCRIPTION_RPA` is always
 * shown, never only the interpretation, and anything the parser could not fully
 * read is called out rather than quietly folded into a confident answer.
 */

import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { assess, type Rule, type Status } from '@parkmtl/rules-core';
import { TIME_ZONE, formatTariff } from '@parkmtl/city-montreal';

import { STATUS_COLOR } from './status-colors.ts';
import { formatDuration, headline, subline } from './format.ts';
import type { Language, Translator } from './i18n.ts';
import type { PoleDetail, SpaceDetail } from './data.ts';

export interface Selection {
  kind: 'pole' | 'bay';
  pole?: PoleDetail;
  space?: SpaceDetail;
  /** Rules governing this feature, resolved from the in-memory dictionary. */
  rules: Rule[];
}

interface Props {
  selection: Selection;
  at: Date;
  dark: boolean;
  t: Translator;
  lang: Language;
  onClose: () => void;
}

/** Which way along the curb a sign points; 0 means it governs both ways. */
function arrowLabel(arrow: number): string | null {
  if (arrow === 0) return null;
  if (arrow === 2) return '←';
  if (arrow === 3) return '→';
  return '↕';
}

export function DetailSheet({ selection, at, dark, t, lang, onClose }: Props) {
  // `paid` is deliberately not set from `kind === 'bay'`: assess's contract is
  // "a paid space *and* within a tariff period", and the tariff period is
  // itself a scheduled regulation. The rate is shown below as its own fact.
  const result = assess(selection.rules, at, { timeZone: TIME_ZONE });

  const status: Status = result.status;
  const accent = STATUS_COLOR[status];
  const space = selection.space;

  return (
    <View style={[styles.sheet, dark && styles.sheetDark]}>
      <View style={styles.grabber} />

      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={styles.headerText}>
          <Text style={[styles.headline, dark && styles.textDark]}>{headline(status, t)}</Text>
          <Text style={[styles.subline, dark && styles.textDimDark]}>
            {subline(result, at, t, lang)}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Text style={[styles.close, dark && styles.textDimDark]}>✕</Text>
        </Pressable>
      </View>

      {result.needsVerification && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
{t('sheet.verify')}
          </Text>
        </View>
      )}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {space && (
          <View style={styles.tariffBlock}>
            {space.street && (
              <Text style={[styles.street, dark && styles.textDark]}>{space.street}</Text>
            )}
            <Text style={[styles.tariff, dark && styles.textDark]}>
              {space.hourlyRateCents
                ? t('sheet.perHour', { amount: formatTariff(space.hourlyRateCents) })
                : t('sheet.noTariff')}
              {space.maxTariffCents
                ? ` · ${t('sheet.maxTariff', { amount: formatTariff(space.maxTariffCents) })}`
                : ''}
            </Text>
            <Text style={[styles.meta, dark && styles.textDimDark]}>
              {[
                space.accessible ? t('sheet.accessible') : null,
                space.paired ? t('sheet.shares', { id: space.paired }) : null,
                space.exploitation,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        )}

        {selection.pole && (
          <>
            <Text style={[styles.sectionLabel, dark && styles.textDimDark]}>
              {selection.pole.signs.length === 1
                ? t('sheet.onePanel')
                : t('sheet.panels', { n: selection.pole.signs.length })}
            </Text>

            {selection.pole.signs.map((sign, i) => (
              <View
                key={`${sign.position}-${i}`}
                // A sub-panel modifies the panel above it and is meaningless on
                // its own, so it is indented under it rather than listed as a
                // rule in its own right.
                style={[styles.sign, sign.isSubPanel && styles.subPanel]}
              >
                <Text style={[styles.signText, dark && styles.textDark]}>
                  {sign.raw}
                  {arrowLabel(sign.arrow) ? ` ${arrowLabel(sign.arrow)}` : ''}
                </Text>
                {sign.confidence !== 'full' && (
                  <Text style={styles.signFlag}>{t('sheet.notUnderstood')}</Text>
                )}
              </View>
            ))}
          </>
        )}

        {result.active.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, dark && styles.textDimDark]}>{t('sheet.inForce')}</Text>
            {result.active.map((rule) => (
              <Text key={rule.id} style={[styles.activeRule, dark && styles.textDimDark]}>
                {rule.raw}
                {rule.maxDurationMin
                  ? ` — ${t('sheet.maxDuration', { duration: formatDuration(rule.maxDurationMin) })}`
                  : ''}
              </Text>
            ))}
          </>
        )}

        <Text style={styles.footnote}>
{t('disclaimer.short')}
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
    maxHeight: '58%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetDark: { backgroundColor: '#161a21' },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c9ced6',
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 18, gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  headerText: { flex: 1 },
  headline: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 },
  subline: { fontSize: 14, marginTop: 2, color: '#5b626e' },
  close: { fontSize: 17, color: '#8a8f98', paddingHorizontal: 4 },
  textDark: { color: '#e8eaed' },
  textDimDark: { color: '#a2a9b4' },
  warning: {
    marginTop: 12,
    marginHorizontal: 18,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fdf0d5',
    borderLeftWidth: 3,
    borderLeftColor: '#c98a04',
  },
  warningText: { fontSize: 12, color: '#6b4e00', lineHeight: 17 },
  body: { marginTop: 14 },
  bodyContent: { paddingHorizontal: 18, paddingBottom: 8 },
  tariffBlock: { marginBottom: 14 },
  street: { fontSize: 16, fontWeight: '600' },
  tariff: { fontSize: 15, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 3, color: '#5b626e' },
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#8a8f98',
    marginBottom: 6,
    marginTop: 4,
  },
  sign: {
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e5ea',
  },
  subPanel: { paddingLeft: 16, opacity: 0.8 },
  signText: { fontSize: 14, lineHeight: 19 },
  signFlag: { fontSize: 11, color: '#c98a04', marginTop: 2 },
  activeRule: { fontSize: 13, color: '#5b626e', paddingVertical: 3 },
  footnote: { fontSize: 11, color: '#8a8f98', marginTop: 16, fontStyle: 'italic' },
});
