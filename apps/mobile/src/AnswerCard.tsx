/**
 * The answer, before anyone taps anything.
 *
 * This is the difference between a map of parking data and an app that tells
 * you whether you can park. It reports on whatever is under the centre reticle
 * and updates as the map moves, so the question is answered by *aiming* rather
 * than by hitting a four-pixel dot.
 *
 * The time scrubber lives inside it, collapsed to a single row, because moving
 * through time is a refinement of the same answer — not a separate mode.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Assessment } from '@parkmtl/rules-core';

import { STATUS_COLOR } from './status-colors.ts';
import { formatWhen, headline, subline } from './format.ts';
import type { Language, Translator } from './i18n.ts';
import { elevation, radius, space, surface, type } from './theme.ts';

export interface CentreAnswer {
  assessment: Assessment;
  /** Street for a paid bay, borough for a pole; whatever we can name. */
  where: string | null;
  kind: 'pole' | 'bay';
}

interface Props {
  answer: CentreAnswer | null;
  at: Date;
  now: Date;
  t: Translator;
  lang: Language;
  dark: boolean;
  scrubberOpen: boolean;
  onToggleScrubber: () => void;
  onExpand: () => void;
  children?: React.ReactNode;
}

export function AnswerCard({
  answer,
  at,
  now,
  t,
  lang,
  dark,
  scrubberOpen,
  onToggleScrubber,
  onExpand,
  children,
}: Props) {
  const s = surface(dark);
  const offset = at.getTime() - now.getTime();
  const isNow = Math.abs(offset) < 60_000;

  const accent = answer ? STATUS_COLOR[answer.assessment.status] : s.textFaint;

  return (
    <View style={[styles.card, { backgroundColor: s.card }, elevation.high]}>
      <Pressable
        onPress={onExpand}
        disabled={!answer}
        style={styles.answerRow}
        accessibilityRole="button"
      >
        <View style={[styles.bar, { backgroundColor: accent }]} />
        <View style={styles.answerText}>
          {answer ? (
            <>
              <Text style={[type.verdict, { color: s.text }]} numberOfLines={1}>
                {headline(answer.assessment.status, t)}
              </Text>
              <Text style={[type.body, { color: s.textDim }]} numberOfLines={1}>
                {subline(answer.assessment, at, t, lang)}
              </Text>
              {answer.where && (
                <Text style={[type.caption, { color: s.textFaint }]} numberOfLines={1}>
                  {answer.where}
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={[type.title, { color: s.textDim }]}>{t('answer.none')}</Text>
              <Text style={[type.caption, { color: s.textFaint }]}>{t('answer.noneHint')}</Text>
            </>
          )}
        </View>
        {answer && <Text style={[styles.chevron, { color: s.textFaint }]}>›</Text>}
      </Pressable>

      <Pressable
        onPress={onToggleScrubber}
        style={[styles.timeRow, { borderTopColor: s.hairline }]}
        accessibilityRole="button"
      >
        <Text style={[type.label, { color: isNow ? s.textDim : s.accent }]}>
          {isNow ? t('scrubber.now') : t('scrubber.at', { time: formatWhen(at, now, t, lang) })}
        </Text>
        <Text style={[type.label, { color: s.textFaint }]}>{scrubberOpen ? '⌄' : '⌃'}</Text>
      </Pressable>

      {children}

      <Text style={[type.micro, styles.footnote, { color: s.textFaint }]}>
        {t('disclaimer.short')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    borderRadius: radius.lg,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bar: { width: 5, alignSelf: 'stretch', minHeight: 46, borderRadius: 3 },
  answerText: { flex: 1, gap: 1 },
  chevron: { fontSize: 26, fontWeight: '300', marginLeft: space.xs },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footnote: { textAlign: 'center', marginTop: space.sm, marginBottom: space.xs },
});
