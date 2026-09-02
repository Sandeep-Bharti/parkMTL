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
import { getLocales } from 'expo-localization';
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

import {
  DATA_DIR,
  loadArtifacts,
  poleDetail,
  spaceDetail,
  type Artifacts,
} from './src/data.ts';
import {
  BAY_LAYER,
  DATA_MIN_ZOOM,
  DATA_SOURCE,
  POLE_LAYER,
  buildDataPaint,
  buildStyle,
} from './src/style.ts';
import { STATUS_COLOR, statusLabel } from './src/status-colors.ts';
import { pickLanguage, translatorFor, type Language } from './src/i18n.ts';
import { DetailSheet, type Selection } from './src/DetailSheet.tsx';
import { TimeScrubber } from './src/TimeScrubber.tsx';
import { SearchBar } from './src/SearchBar.tsx';
import { SettingsSheet, type UpdateState } from './src/SettingsSheet.tsx';
import { loadPlaces, type Place } from './src/search.ts';
import { DATA_BASE_URL, checkForUpdate } from './src/updates.ts';
import { registerRefresh } from './src/background.ts';

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
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offsetHours, setOffsetHours] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [languageOverride, setLanguageOverride] = useState<Language | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>('idle');

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);

  const lang = useMemo(
    () => languageOverride ?? pickLanguage(getLocales().map((l) => l.languageCode)),
    [languageOverride],
  );
  const t = useMemo(() => translatorFor(lang), [lang]);

  useEffect(() => {
    let cancelled = false;
    loadArtifacts()
      .then(async (a) => {
        if (cancelled) return;
        setArtifacts(a);
        setPlaces(await loadPlaces(a.db));
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    void registerRefresh();
    return () => {
      cancelled = true;
    };
  }, []);

  // The instant the map is painted for. `now` is fixed at load so dragging the
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
      setSettingsOpen(false);

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

  const goTo = useCallback((place: Place) => {
    cameraRef.current?.flyTo({
      center: [place.lon, place.lat],
      zoom: place.zoom,
      duration: 800,
    });
  }, []);

  const onCheckUpdates = useCallback(async () => {
    setUpdateState('checking');
    const current = artifacts?.meta.ruleDictVersion ?? null;
    const outcome = await checkForUpdate(DATA_BASE_URL, DATA_DIR, current);
    setUpdateState(
      outcome.status === 'updated'
        ? 'updated'
        : outcome.status === 'up-to-date'
          ? 'up-to-date'
          : 'failed',
    );
  }, [artifacts]);

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
        <Text style={[styles.detail, dark && styles.textDark]}>…</Text>
      </View>
    );
  }

  const sheetOpen = selection !== null || settingsOpen;

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

      <SearchBar
        places={places}
        t={t}
        dark={dark}
        onSelect={goTo}
        onOpenSettings={() => {
          setSelection(null);
          setSettingsOpen(true);
        }}
      />

      <Pressable
        style={[styles.locate, dark && styles.locateDark]}
        onPress={locate}
        accessibilityLabel="Show my location"
      >
        <Text style={styles.locateIcon}>◎</Text>
      </Pressable>

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
                  {statusLabel(status, t)}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.legendRow}>
            {LEGEND.map((status) => (
              <View
                key={status}
                style={[styles.swatchSmall, { backgroundColor: STATUS_COLOR[status] }]}
              />
            ))}
            <Text style={[styles.legendText, dark && styles.textDark]}>{t('legend.title')}</Text>
          </View>
        )}
      </Pressable>

      {!sheetOpen && (
        <TimeScrubber
          offsetHours={offsetHours}
          onChange={setOffsetHours}
          now={now}
          t={t}
          lang={lang}
          dark={dark}
        />
      )}

      {selection && (
        <DetailSheet
          selection={selection}
          at={at}
          dark={dark}
          t={t}
          lang={lang}
          onClose={() => setSelection(null)}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          t={t}
          lang={lang}
          languageOverride={languageOverride}
          onLanguage={setLanguageOverride}
          exportDate={artifacts.meta.exportDate ?? '—'}
          ruleCount={artifacts.rules.length}
          updateState={updateState}
          onCheckUpdates={onCheckUpdates}
          dark={dark}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {!sheetOpen && (
        <View style={styles.disclaimer} pointerEvents="none">
          <Text style={styles.disclaimerText}>{t('disclaimer.short')}</Text>
        </View>
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
    top: 112,
    left: 12,
    padding: 9,
    borderRadius: 10,
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  legendDark: { backgroundColor: 'rgba(17,21,28,0.92)' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 11, height: 11, borderRadius: 6 },
  swatchSmall: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12 },
  locate: {
    position: 'absolute',
    right: 12,
    top: 58,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  locateDark: { backgroundColor: 'rgba(22,26,33,0.96)' },
  locateIcon: { fontSize: 20, color: '#2f6fd0' },
  disclaimer: {
    position: 'absolute',
    bottom: 118,
    left: 12,
    right: 12,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  disclaimerText: { color: '#ffffff', fontSize: 10, textAlign: 'center' },
});
