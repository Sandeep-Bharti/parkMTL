/**
 * Move the whole city through time.
 *
 * "When do I have to move?" is half the product, and the fastest way to answer
 * it is to let someone drag forward and watch the curb change colour. The label
 * shows absolute local time rather than an offset, because a driver thinks
 * "6 PM", not "+4h".
 *
 * Built on a plain PanResponder rather than a slider dependency: the repo has
 * no UI kit, and the interaction is one axis with one value.
 */

import { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatWhen } from './format.ts';
import type { Language, Translator } from './i18n.ts';

/** How far either side of now the scrubber reaches. */
export const RANGE_HOURS = 24;

interface Props {
  /** Hours from now, negative for the past. */
  offsetHours: number;
  onChange: (offsetHours: number) => void;
  now: Date;
  t: Translator;
  lang: Language;
  dark: boolean;
}

export function TimeScrubber({ offsetHours, onChange, now, t, lang, dark }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const at = useMemo(
    () => new Date(now.getTime() + offsetHours * 3_600_000),
    [now, offsetHours],
  );

  const fraction = (offsetHours + RANGE_HOURS) / (RANGE_HOURS * 2);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => seek(e.nativeEvent.locationX),
        onPanResponderMove: (e) => seek(e.nativeEvent.locationX),
      }),
    // `seek` reads the live width from a ref, so the responder never needs
    // rebuilding — recreating it mid-drag would drop the gesture.
    [],
  );

  function seek(x: number) {
    const w = widthRef.current;
    if (w <= 0) return;
    const clamped = Math.min(Math.max(x / w, 0), 1);
    // Quarter-hour steps: finer than that is false precision for signage that
    // changes on the half hour, and it keeps the recolour count sane.
    const hours = (clamped * 2 - 1) * RANGE_HOURS;
    onChange(Math.round(hours * 4) / 4);
  }

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  }

  const isNow = Math.abs(offsetHours) < 0.001;

  return (
    <View style={[styles.wrap, dark && styles.wrapDark]}>
      <View style={styles.track} onLayout={onLayout} {...responder.panHandlers}>
        <View style={[styles.trackLine, dark && styles.trackLineDark]} />
        {/* The midpoint tick marks the present, so "how far from now" stays
            readable without doing arithmetic on the label. */}
        <View style={[styles.midTick, { left: width / 2 - 1 }]} />
        <View style={[styles.knob, { left: Math.max(0, fraction * width - 11) }]} />
      </View>

      <View style={styles.scaleRow}>
        <Text style={styles.scale}>−24h</Text>
        {!isNow && (
          <Pressable onPress={() => onChange(0)} hitSlop={12}>
            <Text style={styles.reset}>{t('scrubber.now')}</Text>
          </Pressable>
        )}
        <Text style={styles.scale}>+24h</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Lives inside AnswerCard now, so it lays out in flow rather than floating.
  wrap: { paddingTop: 2 },
  wrapDark: {},
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '600' },
  textDark: { color: '#e8eaed' },
  reset: { fontSize: 13, fontWeight: '600', color: '#2f6fd0' },
  track: { height: 34, justifyContent: 'center', marginTop: 2 },
  trackLine: { height: 3, borderRadius: 2, backgroundColor: '#dfe3e9' },
  trackLineDark: { backgroundColor: '#2b313b' },
  midTick: {
    position: 'absolute',
    width: 2,
    height: 12,
    backgroundColor: '#b6bcc6',
    borderRadius: 1,
  },
  knob: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#2f6fd0',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  scale: { fontSize: 10, color: '#8a8f98' },
});
