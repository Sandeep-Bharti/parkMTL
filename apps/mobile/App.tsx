import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Map, Camera } from '@maplibre/maplibre-react-native';

import { loadArtifacts, type Artifacts } from './src/data.ts';
import { buildStyle } from './src/style.ts';
import { STATUS_COLOR, STATUS_LABEL } from './src/status-colors.ts';

/** Downtown Montreal, where the signage is densest. */
const START = { center: [-73.5673, 45.5019] as [number, number], zoom: 15 };

/**
 * Only the statuses this build can actually paint.
 *
 * `paid` is deliberately absent: `statusByRuleId` has no notion of tariffs, so
 * it never returns it — paid-ness rides on the bay feature's own `paid` flag,
 * which Phase 4 folds in. Listing a colour the map cannot produce would be a
 * legend that lies.
 */
const LEGEND = [
  'free',
  'limited',
  'permit_only',
  'no_parking',
  'no_standing',
  'unknown',
] as const;

export default function App() {
  const dark = useColorScheme() === 'dark';
  const [artifacts, setArtifacts] = useState<Artifacts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadArtifacts()
      .then((a) => !cancelled && setArtifacts(a))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 3 paints a single instant. The scrubber that makes this reactive is
  // Phase 4 — the expression is already rebuilt from scratch each time, so it
  // only needs a different date.
  const now = useMemo(() => new Date(), []);

  const style = useMemo(() => {
    if (!artifacts) return null;
    return buildStyle({
      baseTilesUrl: artifacts.baseTilesUrl,
      dataTilesUrl: artifacts.dataTilesUrl,
      rules: artifacts.rules,
      combos: artifacts.combos,
      at: now,
      dark,
    });
  }, [artifacts, now, dark]);

  if (error) {
    return (
      <View style={[styles.centre, dark && styles.centreDark]}>
        <Text style={[styles.error, dark && styles.textDark]}>Could not load parking data</Text>
        <Text style={[styles.detail, dark && styles.textDark]}>{error}</Text>
      </View>
    );
  }

  if (!style || !artifacts) {
    return (
      <View style={[styles.centre, dark && styles.centreDark]}>
        <ActivityIndicator />
        <Text style={[styles.detail, dark && styles.textDark]}>Preparing map data…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Map style={styles.map} mapStyle={style} attribution compass>
        <Camera initialViewState={{ center: START.center, zoom: START.zoom }} />
      </Map>

      <View style={[styles.legend, dark && styles.legendDark]}>
        {LEGEND.map((status) => (
          <View key={status} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: STATUS_COLOR[status] }]} />
            <Text style={[styles.legendText, dark && styles.textDark]}>
              {STATUS_LABEL[status]}
            </Text>
          </View>
        ))}
        <Text style={[styles.stamp, dark && styles.textDark]}>
          {artifacts.rules.length} rules · data {artifacts.meta.exportDate}
        </Text>
      </View>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          Guidance only — the signs on the street are authoritative.
        </Text>
      </View>

      <StatusBar style={dark ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
  },
  centreDark: { backgroundColor: '#11151c' },
  error: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13, opacity: 0.7, textAlign: 'center', paddingHorizontal: 24 },
  textDark: { color: '#e8eaed' },
  legend: {
    position: 'absolute',
    top: 60,
    left: 12,
    padding: 10,
    borderRadius: 10,
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  legendDark: { backgroundColor: 'rgba(17,21,28,0.92)' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 11, height: 11, borderRadius: 6 },
  legendText: { fontSize: 12 },
  stamp: { fontSize: 10, opacity: 0.6, marginTop: 3 },
  disclaimer: {
    position: 'absolute',
    bottom: 28,
    left: 12,
    right: 12,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  disclaimerText: { color: '#ffffff', fontSize: 11, textAlign: 'center' },
});
