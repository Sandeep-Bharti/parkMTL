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
  /** Clears the locate FAB, which floats on the same edge. */
  rightInset: number;
  onSelect: (place: Place) => void;
  onOpenSettings: () => void;
}

export function SearchBar({
  places,
  t,
  dark,
  top,
  rightInset,
  onSelect,
  onOpenSettings,
}: Props) {
  const s = surface(dark);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => searchPlaces(places, query), [places, query]);
  const showResults = focused && query.trim().length >= 2;

  const selectFirstResult = () => {
    if (results.length === 0) return;
    setFocused(false);
    setQuery('');
    onSelect(results[0]);
  };

  return (
    <View style={[styles.wrap, { top, right: rightInset }]}>
      <View style={[styles.bar, { backgroundColor: s.card }, elevation.low]}>
        <Text style={[styles.icon, { color: s.textFaint }]}>⌕</Text>
        <TextInput
          style={[styles.input, { color: s.text }]}
          placeholder={t('search.placeholder')}
          placeholderTextColor={s.textFaint}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onSubmitEditing={selectFirstResult}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityLabel={t('search.clear')}
          >
            <Text style={[styles.clear, { color: s.textFaint }]}>✕</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onOpenSettings} hitSlop={10} accessibilityLabel={t('search.settings')}>
            <Text style={[styles.clear, { color: s.textFaint }]}>☰</Text>
          </Pressable>
        )}
      </View>

      {showResults && (
        <View style={[styles.results, { backgroundColor: s.card }, elevation.low]}>
          {results.length === 0 ? (
            <Text style={[type.body, styles.empty, { color: s.textFaint }]}>
              {t('search.noResults')}
            </Text>
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
                <Text style={[type.body, { color: s.text }]}>{place.name}</Text>
                <Text style={[type.caption, styles.resultKind, { color: s.textFaint }]}>
                  {place.kind === 'street' ? t('search.streets') : t('search.boroughs')}
                </Text>
              </Pressable>
            ))
          )}
          <Text style={[type.micro, styles.note, { color: s.textFaint }]}>
            {t('search.limitation')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    height: 42,
    borderRadius: radius.pill,
  },
  icon: { fontSize: 17 },
  input: { flex: 1, fontSize: 15, padding: 0 },
  clear: { fontSize: 15 },
  results: {
    marginTop: 6,
    borderRadius: radius.md,
    paddingVertical: space.xs,
  },
  result: { paddingVertical: space.sm, paddingHorizontal: space.md + 2 },
  resultKind: { marginTop: 1 },
  empty: { padding: space.lg - 2 },
  note: {
    paddingHorizontal: space.md + 2,
    paddingTop: space.xs + 2,
    paddingBottom: space.xs,
    lineHeight: 14,
  },
});
