import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getLocales } from 'expo-localization';
import * as Haptics from 'expo-haptics';
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

import { assess, type Rule } from '@parkmtl/rules-core';
import { TIME_ZONE } from '@parkmtl/city-montreal';

import {
  DATA_DIR,
  loadArtifacts,
  poleDetail,
  spaceDetail,
  writeRecord,
  type Artifacts,
} from './src/data.ts';
import { artifactNames, dueForCheck } from './src/installed.ts';
import {
  BAY_LAYER,
  DATA_MIN_ZOOM,
  DATA_SOURCE,
  POLE_LAYER,
  buildDataPaint,
  buildStyle,
} from './src/style.ts';
import { pickLanguage, translatorFor, type Language } from './src/i18n.ts';
import { DetailSheet, type Selection } from './src/DetailSheet.tsx';
import { TimeScrubber } from './src/TimeScrubber.tsx';
import { SearchBar } from './src/SearchBar.tsx';
import { SettingsSheet, type UpdateState } from './src/SettingsSheet.tsx';
import { SupportSheet } from './src/SupportSheet.tsx';
import { AnswerCard, type CentreAnswer } from './src/AnswerCard.tsx';
import { Onboarding } from './src/Onboarding.tsx';
import { loadPlaces, type Place } from './src/search.ts';
import { DATA_BASE_URL, checkForUpdate, describeOutcome } from './src/updates.ts';
import { registerRefresh } from './src/background.ts';
import { hasOnboarded, setOnboarded } from './src/prefs.ts';
import { elevation, radius, space, surface, type } from './src/theme.ts';

/** Downtown Montreal, where the signage is densest. */
const START = { center: [-73.5673, 45.5019] as [number, number], zoom: 16 };

/**
 * Half-width of the hit box, in points.
 *
 * The dots are a few pixels wide. An exact-pixel query misses almost every tap
 * and every centre probe, so both use a rect and take the nearest result.
 */
const TAP_SLOP = 22;
const CENTRE_SLOP = 34;

export default function App() {
  return (
    <SafeAreaProvider>
      <Parkmtl />
    </SafeAreaProvider>
  );
}

function Parkmtl() {
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const s = surface(dark);

  const [artifacts, setArtifacts] = useState<Artifacts | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offsetHours, setOffsetHours] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tracking, setTracking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [scrubberOpen, setScrubberOpen] = useState(false);
  const [languageOverride, setLanguageOverride] = useState<Language | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [onboarding, setOnboarding] = useState(false);
  const [centre, setCentre] = useState<CentreAnswer | null>(null);

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
        setOnboarding(!(await hasOnboarded()));
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    void registerRefresh();
    return () => {
      cancelled = true;
    };
  }, []);

  const now = useMemo(() => new Date(), [artifacts]);
  const at = useMemo(
    () => new Date(now.getTime() + offsetHours * 3_600_000),
    [now, offsetHours],
  );

  const style = useMemo(() => {
    if (!artifacts) return null;
    return buildStyle({
      baseTilesUrl: artifacts.baseTilesUrl,
      dataTilesUrl: artifacts.dataTilesUrl,
      dark,
      lang,
    });
  }, [artifacts, dark, lang]);

  // Changes on every scrubber tick; only the layers' paint props are updated.
  const paint = useMemo(() => {
    if (!artifacts) return null;
    return buildDataPaint(artifacts.rules, artifacts.poleCombos, artifacts.bayCombos, at, dark);
  }, [artifacts, at, dark]);

  const rulesById = useMemo(() => {
    const map = new Map<number, Rule>();
    for (const rule of artifacts?.rules ?? []) map.set(rule.id, rule);
    return map;
  }, [artifacts]);

  /**
   * Resolve whatever the map has under a screen point into a selection.
   *
   * Poles and bays are queried separately because returned features carry no
   * source-layer identity. A pole wins a tie: it governs the whole curb, where
   * a bay is one space on it.
   */
  const resolveAt = useCallback(
    async (point: [number, number], slop: number): Promise<Selection | null> => {
      if (!artifacts || !mapRef.current) return null;
      const [x, y] = point;
      const rect: [[number, number], [number, number]] = [
        [x - slop, y - slop],
        [x + slop, y + slop],
      ];

      const [poles, bays] = await Promise.all([
        mapRef.current.queryRenderedFeatures(rect, { layers: [POLE_LAYER] }),
        mapRef.current.queryRenderedFeatures(rect, { layers: [BAY_LAYER] }),
      ]);

      const poleId = poles[0]?.properties?.pole;
      if (poleId != null) {
        const detail = await poleDetail(artifacts.db, String(poleId));
        if (!detail) return null;
        return {
          kind: 'pole',
          pole: detail,
          // Sub-panels modify the panel above and are not rules in their own
          // right, so they must not be fed to the evaluator.
          rules: detail.signs
            .filter((sign) => !sign.isSubPanel)
            .map((sign) => rulesById.get(sign.ruleId))
            .filter((r): r is Rule => r !== undefined),
        };
      }

      const spaceId = bays[0]?.properties?.space;
      if (spaceId != null) {
        const detail = await spaceDetail(artifacts.db, String(spaceId));
        if (!detail) return null;
        return {
          kind: 'bay',
          space: detail,
          rules: detail.ruleIds
            .map((id) => rulesById.get(id))
            .filter((r): r is Rule => r !== undefined),
        };
      }

      return null;
    },
    [artifacts, rulesById],
  );

  /** Turn a selection into the one-line verdict the answer card shows. */
  const answerFrom = useCallback(
    (found: Selection | null): CentreAnswer | null => {
      if (!found) return null;
      return {
        kind: found.kind,
        // Not `paid: kind === 'bay'`: a meter is only running during its
        // tariff hours, and claiming otherwise tells people to pay overnight
        // when they need not. The tariff is shown as a fact in the sheet.
        assessment: assess(found.rules, at, { timeZone: TIME_ZONE }),
        where: found.space?.street ?? found.pole?.borough ?? null,
      };
    },
    [at],
  );

  /**
   * Re-answer for the map centre whenever it settles.
   *
   * Debounced by the event itself — `onRegionDidChange` fires once the gesture
   * ends, not during it — so panning stays smooth.
   */
  const onRegionDidChange = useCallback(async () => {
    if (!mapRef.current) return;
    const centrePoint = await mapRef.current.getCenter();
    const pixel = await mapRef.current.project(centrePoint);
    setCentre(answerFrom(await resolveAt(pixel as [number, number], CENTRE_SLOP)));
  }, [answerFrom, resolveAt]);

  // Keep the centre answer honest when time moves under a stationary map.
  useEffect(() => {
    if (artifacts) void onRegionDidChange();
  }, [artifacts, at]);

  const onPress = useCallback(
    async (event: NativeSyntheticEvent<PressEvent>) => {
      setSettingsOpen(false);
      const found = await resolveAt(event.nativeEvent.point as [number, number], TAP_SLOP);
      if (found) void Haptics.selectionAsync();
      setSelection(found);
    },
    [resolveAt],
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

  /**
   * Check, install, and apply — without a restart.
   *
   * On success the artifacts are reloaded and swapped into state. Rules, combos
   * and the tile URL all flow from that, so the map recolours and the style
   * picks up the new (versioned) source URL on its own.
   */
  const runUpdate = useCallback(
    async (manual: boolean) => {
      if (!artifacts) return;
      if (manual) setUpdateState('checking');

      const current = artifacts.installed;
      // Destination names come from the *incoming* build, so pass the factory
      // rather than the current build's names.
      const outcome = await checkForUpdate(
        DATA_BASE_URL,
        DATA_DIR,
        current.ruleDictVersion,
        artifactNames,
      );

      const checkedAt = new Date().toISOString();
      const note = describeOutcome(outcome);

      if (outcome.status === 'updated' && outcome.manifest) {
        // Record the new build only after its files are in place, then reload.
        await writeRecord({
          ruleDictVersion: outcome.manifest.ruleDictVersion,
          exportDate: outcome.manifest.exportDate,
          builtAt: outcome.manifest.builtAt,
          source: 'download',
          lastCheckedAt: checkedAt,
          lastOutcome: note,
        });
        const fresh = await loadArtifacts();
        await artifacts.db.closeAsync().catch(() => {});
        setArtifacts(fresh);
        setPlaces(await loadPlaces(fresh.db));
        setUpdateState('updated');
        return;
      }

      await writeRecord({ ...current, lastCheckedAt: checkedAt, lastOutcome: note });
      setUpdateState(
        outcome.status === 'up-to-date'
          ? 'up-to-date'
          : outcome.status === 'not-configured'
            ? 'not-configured'
            : 'failed',
      );
    },
    [artifacts],
  );

  const onCheckUpdates = useCallback(() => void runUpdate(true), [runUpdate]);

  // Check when the app opens and when it comes back to the foreground, rate
  // limited. The background task is a top-up, not the only path — the OS may
  // never schedule it.
  useEffect(() => {
    if (!artifacts) return;
    const maybeCheck = () => {
      if (dueForCheck(artifacts.installed, new Date())) void runUpdate(false);
    };
    maybeCheck();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') maybeCheck();
    });
    return () => sub.remove();
  }, [artifacts, runUpdate]);

  const finishOnboarding = useCallback(
    async (allowLocation: boolean) => {
      setOnboarding(false);
      await setOnboarded();
      if (allowLocation) void locate();
    },
    [locate],
  );

  if (error) {
    return (
      <View style={[styles.centre, { backgroundColor: dark ? '#11151c' : '#fff' }]}>
        <Text style={[type.title, { color: s.text }]}>Could not load parking data</Text>
        <Text style={[type.caption, styles.errorDetail, { color: s.textDim }]}>{error}</Text>
      </View>
    );
  }

  if (!style || !paint || !artifacts) {
    return (
      <View style={[styles.centre, { backgroundColor: dark ? '#11151c' : '#fff' }]}>
        <ActivityIndicator color={s.accent} />
      </View>
    );
  }

  const sheetOpen = selection !== null || settingsOpen || supportOpen;

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={style}
        onPress={onPress}
        onRegionDidChange={onRegionDidChange}
        attribution
        attributionPosition={{ top: 8, right: 8 }}
        compass={false}
        logo={false}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: START.center, zoom: START.zoom }}
        />

        {/* Bays under signs: a sign governs the curb, a bay is one space on it. */}
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
        {/* A ring on the tapped feature. Updating a filter mutates the live
            layer, so this costs nothing and never reloads the style. */}
        <Layer
          id="pole-selected"
          type="circle"
          source={DATA_SOURCE}
          source-layer="poles"
          minzoom={DATA_MIN_ZOOM}
          filter={['==', ['get', 'pole'], selection?.pole?.id ?? '']}
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 18],
            'circle-color': 'transparent',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': s.accent,
          }}
        />

        {tracking && <UserLocation />}
      </MapView>

      {/* The reticle: what "here" means for the answer card. Hidden while a
          sheet is up, since the answer on screen is then a specific feature. */}
      {!sheetOpen && (
        <View pointerEvents="none" style={styles.reticleWrap}>
          <View style={[styles.reticle, { borderColor: s.accent }]} />
        </View>
      )}

      <SearchBar
        places={places}
        t={t}
        dark={dark}
        top={insets.top + space.sm}
        onSelect={goTo}
        onOpenSettings={() => {
          setSelection(null);
          setSettingsOpen(true);
        }}
      />

      <Pressable
        style={[
          styles.locate,
          { top: insets.top + space.sm + 52, backgroundColor: s.card },
          elevation.low,
        ]}
        onPress={locate}
        accessibilityLabel="Show my location"
      >
        <Text style={[styles.locateIcon, { color: s.accent }]}>◎</Text>
      </Pressable>

      {!sheetOpen && (
        <View style={[styles.dock, { bottom: Math.max(insets.bottom, space.md) }]}>
          <AnswerCard
            answer={centre}
            at={at}
            now={now}
            t={t}
            lang={lang}
            dark={dark}
            scrubberOpen={scrubberOpen}
            onToggleScrubber={() => setScrubberOpen((v) => !v)}
            onExpand={async () => {
              const found = await resolveAt(
                (await mapRef.current!.project(await mapRef.current!.getCenter())) as [
                  number,
                  number,
                ],
                CENTRE_SLOP,
              );
              if (found) {
                void Haptics.selectionAsync();
                setSelection(found);
              }
            }}
          >
            {scrubberOpen && (
              <TimeScrubber
                offsetHours={offsetHours}
                onChange={setOffsetHours}
                now={now}
                t={t}
                lang={lang}
                dark={dark}
              />
            )}
          </AnswerCard>
        </View>
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
          onOpenSupport={() => {
            setSettingsOpen(false);
            setSupportOpen(true);
          }}
          dark={dark}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {supportOpen && (
        <SupportSheet t={t} dark={dark} onClose={() => setSupportOpen(false)} />
      )}

      {onboarding && <Onboarding t={t} dark={dark} onDone={finishOnboarding} />}

      <StatusBar style={dark ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  errorDetail: { textAlign: 'center', paddingHorizontal: space.xl },
  reticleWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifted so the reticle sits above the answer card rather than behind it.
    marginBottom: 150,
  },
  reticle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    backgroundColor: 'transparent',
  },
  locate: {
    position: 'absolute',
    right: space.md,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateIcon: { fontSize: 21 },
  dock: { position: 'absolute', left: 0, right: 0 },
});
