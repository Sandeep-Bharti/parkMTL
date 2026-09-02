/**
 * Search by street or borough.
 *
 * The limitation is stated in the UI rather than hidden: only streets with paid
 * parking carry a name in the data, so a driver who searches for a residential
 * street and finds nothing should understand why instead of concluding the app
 * is broken.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Translator } from './i18n.ts';
import { searchPlaces, type Place } from './search.ts';
import { elevation, radius, space, surface, type } from './theme.ts';

interface Props {
  places: Place[];
  t: Translator;
  dark: boolean;
  /** Distance from the top of the screen, past the safe-area inset. */
  top: number;
  onSelect: (place: Place) => void;
  onOpenSettings: () => void;
}

export function SearchBar({ places, t, dark, top, onSelect, onOpenSettings }: Props) {
  const s = surface(dark);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => searchPlaces(places, query), [places, query]);
  const showResults = focused && query.trim().length >= 2;

  return (
    <View style={[styles.wrap, { top }]}>
      <View style={[styles.bar, { backgroundColor: s.card }, elevation.low]}>
        <Text style={styles.icon}>⌕</Text>
        <TextInput
          style={[styles.input, dark && styles.textDark]}
          placeholder={t('search.placeholder')}
          placeholderTextColor={dark ? '#79808b' : '#9aa0aa'}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onOpenSettings} hitSlop={10} accessibilityLabel="Settings">
            <Text style={styles.clear}>☰</Text>
          </Pressable>
        )}
      </View>

      {showResults && (
        <View style={[styles.results, dark && styles.resultsDark]}>
          {results.length === 0 ? (
            <Text style={[styles.empty, dark && styles.dimDark]}>{t('search.noResults')}</Text>
          ) : (
            results.map((place) => (
              <Pressable
                key={`${place.kind}:${place.name}`}
                style={styles.result}
                onPress={() => {
                  setFocused(false);
                  setQuery('');
                  onSelect(place);
                }}
              >
                <Text style={[styles.resultName, dark && styles.textDark]}>{place.name}</Text>
                <Text style={styles.resultKind}>
                  {place.kind === 'street' ? t('search.streets') : t('search.boroughs')}
                </Text>
              </Pressable>
            ))
          )}
          <Text style={[styles.note, dark && styles.dimDark]}>{t('search.limitation')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: 68 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  barDark: { backgroundColor: 'rgba(22,26,33,0.96)' },
  icon: { fontSize: 17, color: '#8a8f98' },
  input: { flex: 1, fontSize: 15, padding: 0 },
  clear: { fontSize: 15, color: '#8a8f98' },
  textDark: { color: '#e8eaed' },
  dimDark: { color: '#a2a9b4' },
  results: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.98)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  resultsDark: { backgroundColor: 'rgba(22,26,33,0.98)' },
  result: { paddingVertical: 8, paddingHorizontal: 14 },
  resultName: { fontSize: 14 },
  resultKind: { fontSize: 11, color: '#8a8f98', marginTop: 1 },
  empty: { padding: 14, fontSize: 13, color: '#8a8f98' },
  note: {
    fontSize: 10,
    color: '#8a8f98',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
    lineHeight: 14,
  },
});
