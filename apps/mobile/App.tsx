import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Camera,
  Layer,
  LocationManager,
  // Aliased: the component is named `Map`, which would shadow the global Map
  // constructor used for the rule lookup below.
  Map as MapView,
  UserLocation,
  type CameraRef,
  type MapRef,
  type PressEvent,
} from '@maplibre/maplibre-react-native';

import type { Rule } from '@parkmtl/rules-core';

import { loadArtifacts, poleDetail, spaceDetail, type Artifacts } from './src/data.ts';
import {
  BAY_LAYER,
  DATA_MIN_ZOOM,
  DATA_SOURCE,
  POLE_LAYER,
  buildDataPaint,
  buildStyle,
} from './src/style.ts';
import { STATUS_COLOR, STATUS_LABEL } from './src/status-colors.ts';
import { DetailSheet, type Selection } from './src/DetailSheet.tsx';
import { TimeScrubber } from './src/TimeScrubber.tsx';

/** Downtown Montreal, where the signage is densest. */
const START = { center: [-73.5673, 45.5019] as [number, number], zoom: 15 };

/** Only the statuses this build can actually paint — see the note in style.ts. */
const LEGEND = [
  'free',
  'limited',
  'permit_only',
  'no_parking',
  'no_standing',
  'unknown',
] as const;

/**
 * Half-width of the tap hit box, in points.
 *
 * The dots are 2-6 px wide. An exact-pixel hit test misses almost every tap, so
 * the query is a rect around the touch and the nearest result wins.
 */
const TAP_SLOP = 22;

export default function App() {
  const dark = useColorScheme() === 'dark';
  const [artifacts, setArtifacts] = useState<Artifacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offsetHours, setOffsetHours] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [tracking, setTracking] = useState(false);

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);

  useEffect(() => {
    let cancelled = false;
    loadArtifacts()
      .then((a) => !cancelled && setArtifacts(a))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // The instant the map is painted for. `now` is fixed at mount so dragging the
  // scrubber is reproducible; the offset moves relative to it.
  const now = useMemo(() => new Date(), [artifacts]);
  const at = useMemo(
    () => new Date(now.getTime() + offsetHours * 3_600_000),
    [now, offsetHours],
  );

  // Constant: rebuilding this would tear down every source and reload the map.
  const style = useMemo(() => {
    if (!artifacts) return null;
    return buildStyle({
      baseTilesUrl: artifacts.baseTilesUrl,
      dataTilesUrl: artifacts.dataTilesUrl,
      dark,
    });
  }, [artifacts, dark]);

  // Changes on every scrubber tick; only the layers' paint props are updated.
  const paint = useMemo(() => {
    if (!artifacts) return null;
    return buildDataPaint(artifacts.rules, artifacts.combos, at, dark);
  }, [artifacts, at, dark]);

  const rulesById = useMemo(() => {
    const map = new Map<number, Rule>();
    for (const rule of artifacts?.rules ?? []) map.set(rule.id, rule);
    return map;
  }, [artifacts]);

  const onPress = useCallback(
    async (event: NativeSyntheticEvent<PressEvent>) => {
      if (!artifacts || !mapRef.current) return;

      const [x, y] = event.nativeEvent.point;
      const rect: [[number, number], [number, number]] = [
        [x - TAP_SLOP, y - TAP_SLOP],
        [x + TAP_SLOP, y + TAP_SLOP],
      ];

      // Queried separately because returned features carry no source-layer
      // identity — there is no way to tell a pole from a bay in one result set.
      const [poles, bays] = await Promise.all([
        mapRef.current.queryRenderedFeatures(rect, { layers: [POLE_LAYER] }),
        mapRef.current.queryRenderedFeatures(rect, { layers: [BAY_LAYER] }),
      ]);

      // A pole carries one feature per sign, all at the same point; the bay
      // layer sits underneath, so a sign wins a tie.
      const poleId = poles[0]?.properties?.pole as string | undefined;
      if (poleId != null) {
        const detail = await poleDetail(artifacts.db, String(poleId));
        if (!detail) return;
        setSelection({
          kind: 'pole',
          pole: detail,
          // Sub-panels modify the panel above and are not rules in their own
          // right, so they must not be fed to the evaluator.
          rules: detail.signs
            .filter((s) => !s.isSubPanel)
            .map((s) => rulesById.get(s.ruleId))
            .filter((r): r is Rule => r !== undefined),
        });
        return;
      }

      const spaceId = bays[0]?.properties?.space as string | undefined;
      if (spaceId != null) {
        const detail = await spaceDetail(artifacts.db, String(spaceId));
        if (!detail) return;
        setSelection({
          kind: 'bay',
          space: detail,
          rules: detail.ruleIds
            .map((id) => rulesById.get(id))
            .filter((r): r is Rule => r !== undefined),
        });
        return;
      }

      setSelection(null);
    },
    [artifacts, rulesById],
  );

  const locate = useCallback(async () => {
    const granted = await LocationManager.requestPermissions();
    if (!granted) return;
    setTracking(true);
    const position = await LocationManager.getCurrentPosition();
    if (position) {
      cameraRef.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 17,
        duration: 700,
      });
    }
  }, []);

  if (error) {
    return (
      <View style={[styles.centre, dark && styles.centreDark]}>
        <Text style={[styles.error, dark && styles.textDark]}>Could not load parking data</Text>
        <Text style={[styles.detail, dark && styles.textDark]}>{error}</Text>
      </View>
    );
  }

  if (!style || !paint || !artifacts) {
    return (
      <View style={[styles.centre, dark && styles.centreDark]}>
        <ActivityIndicator />
        <Text style={[styles.detail, dark && styles.textDark]}>Preparing map data…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={style}
        onPress={onPress}
        attribution
        compass
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: START.center, zoom: START.zoom }}
        />

        {/* Bays sit under the signs: a sign governs the whole curb, a bay is one
            space on it, so the sign wins when they land on the same pixel. */}
        <Layer
          id={BAY_LAYER}
          type="circle"
          source={DATA_SOURCE}
          source-layer="bays"
          minzoom={DATA_MIN_ZOOM}
          paint={paint.bays}
        />
        <Layer
          id={POLE_LAYER}
          type="circle"
          source={DATA_SOURCE}
          source-layer="poles"
          minzoom={DATA_MIN_ZOOM}
          paint={paint.poles}
        />

        {tracking && <UserLocation />}
      </MapView>

      <Pressable
        style={[styles.legend, dark && styles.legendDark]}
        onPress={() => setLegendOpen((v) => !v)}
      >
        {legendOpen ? (
          <>
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
          </>
        ) : (
          <View style={styles.legendRow}>
            {LEGEND.map((status) => (
              <View
                key={status}
                style={[styles.swatchSmall, { backgroundColor: STATUS_COLOR[status] }]}
              />
            ))}
            <Text style={[styles.legendText, dark && styles.textDark]}>Legend</Text>
          </View>
        )}
      </Pressable>

      <Pressable
        style={[styles.locate, dark && styles.locateDark]}
        onPress={locate}
        accessibilityLabel="Show my location"
      >
        <Text style={styles.locateIcon}>◎</Text>
      </Pressable>

      {selection ? (
        <DetailSheet
          selection={selection}
          at={at}
          dark={dark}
          onClose={() => setSelection(null)}
        />
      ) : (
        <TimeScrubber
          offsetHours={offsetHours}
          onChange={setOffsetHours}
          now={now}
          dark={dark}
        />
      )}

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
  swatchSmall: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12 },
  stamp: { fontSize: 10, opacity: 0.6, marginTop: 3 },
  locate: {
    position: 'absolute',
    right: 12,
    top: 60,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  locateDark: { backgroundColor: 'rgba(17,21,28,0.92)' },
  locateIcon: { fontSize: 20, color: '#2f6fd0' },
});
