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
import { elevation, radius, space as sp, surface, type } from './theme.ts';

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
  const bay = selection.space;
  const s = surface(dark);

  return (
    <View style={[styles.sheet, { backgroundColor: s.card }, elevation.high]}>
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={styles.headerText}>
          <Text style={[type.verdict, styles.headline, { color: s.text }]}>
            {headline(status, t)}
          </Text>
          <Text style={[type.body, styles.subline, { color: s.textDim }]}>
            {subline(result, at, t, lang)}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('sheet.close')}>
          <Text style={[styles.close, { color: s.textDim }]}>✕</Text>
        </Pressable>
      </View>

      {result.needsVerification && (
        <View
          style={[
            styles.warning,
            { backgroundColor: s.warningBg, borderLeftColor: s.warningBorder },
          ]}
        >
          <Text style={[type.caption, styles.warningText, { color: s.warningText }]}>
            {t('sheet.verify')}
          </Text>
        </View>
      )}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {bay && (
          <View style={styles.tariffBlock}>
            {bay.street && (
              <Text style={[type.title, styles.street, { color: s.text }]}>{bay.street}</Text>
            )}
            <Text style={[type.body, styles.tariff, { color: s.text }]}>
              {bay.hourlyRateCents
                ? t('sheet.perHour', { amount: formatTariff(bay.hourlyRateCents) })
                : t('sheet.noTariff')}
              {bay.maxTariffCents
                ? ` · ${t('sheet.maxTariff', { amount: formatTariff(bay.maxTariffCents) })}`
                : ''}
            </Text>
            <Text style={[type.caption, styles.meta, { color: s.textDim }]}>
              {[
                bay.accessible ? t('sheet.accessible') : null,
                bay.paired ? t('sheet.shares', { id: bay.paired }) : null,
                bay.exploitation,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        )}

        {selection.pole && (
          <>
            <Text style={[type.label, styles.sectionLabel, { color: s.textFaint }]}>
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
                style={[
                  styles.sign,
                  { borderTopColor: s.hairline },
                  sign.isSubPanel && styles.subPanel,
                ]}
              >
                <Text style={[type.body, styles.signText, { color: s.text }]}>
                  {sign.raw}
                  {arrowLabel(sign.arrow) ? ` ${arrowLabel(sign.arrow)}` : ''}
                </Text>
                {sign.confidence !== 'full' && (
                  <Text style={[type.caption, styles.signFlag, { color: s.warningBorder }]}>
                    {t('sheet.notUnderstood')}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {result.active.length > 0 && (
          <>
            <Text style={[type.label, styles.sectionLabel, { color: s.textFaint }]}>
              {t('sheet.inForce')}
            </Text>
            {result.active.map((rule) => (
              <Text
                key={rule.id}
                style={[type.caption, styles.activeRule, { color: s.textDim }]}
              >
                {rule.raw}
                {rule.maxDurationMin
                  ? ` — ${t('sheet.maxDuration', { duration: formatDuration(rule.maxDurationMin) })}`
                  : ''}
              </Text>
            ))}
          </>
        )}

        <Text style={[type.caption, styles.footnote, { color: s.textFaint }]}>
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
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: sp.md,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: sp.lg + 2,
    gap: sp.sm + 2,
  },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  headerText: { flex: 1 },
  headline: { letterSpacing: -0.2 },
  subline: { marginTop: 2 },
  close: { fontSize: 17, paddingHorizontal: 4 },
  warning: {
    marginTop: sp.md,
    marginHorizontal: sp.lg + 2,
    padding: sp.sm + 2,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
  },
  warningText: { lineHeight: 17 },
  body: { marginTop: sp.md + 2 },
  bodyContent: { paddingHorizontal: sp.lg + 2, paddingBottom: sp.sm },
  tariffBlock: { marginBottom: sp.md + 2 },
  street: {},
  tariff: { marginTop: 2 },
  meta: { marginTop: 3 },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: sp.xs + 2,
    marginTop: sp.xs,
  },
  sign: {
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subPanel: { paddingLeft: sp.md + 4, opacity: 0.8 },
  signText: { lineHeight: 19 },
  signFlag: { marginTop: 2 },
  activeRule: { paddingVertical: 3 },
  footnote: { marginTop: sp.lg, fontStyle: 'italic' },
});
