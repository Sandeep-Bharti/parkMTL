/**
 * The app's visual language, in one place.
 *
 * Previously every component carried its own greys, radii and shadows, which
 * meant nothing quite matched and any change had to be made six times.
 */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const type = {
  /** The verdict. Large enough to read at arm's length in a car. */
  verdict: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
  micro: { fontSize: 10.5, fontWeight: '500', letterSpacing: 0.4 },
} as const;

interface Surface {
  /** Cards and sheets floating over the map. */
  card: string;
  /** Same, but where the map should read through slightly. */
  scrim: string;
  text: string;
  textDim: string;
  textFaint: string;
  hairline: string;
  /** Ring drawn around available parking so it lifts off the basemap. */
  halo: string;
  accent: string;
}

export const light: Surface = {
  card: 'rgba(255,255,255,0.97)',
  scrim: 'rgba(255,255,255,0.86)',
  text: '#11151c',
  textDim: '#5b626e',
  textFaint: '#8a8f98',
  hairline: '#e4e7ec',
  halo: '#ffffff',
  accent: '#2f6fd0',
};

export const dark: Surface = {
  card: 'rgba(22,26,33,0.97)',
  scrim: 'rgba(22,26,33,0.86)',
  text: '#e8eaed',
  textDim: '#a2a9b4',
  textFaint: '#79808b',
  hairline: '#2b313b',
  halo: '#10141a',
  accent: '#5c9bff',
};

export const surface = (isDark: boolean): Surface => (isDark ? dark : light);

/** Two levels only: things resting on the map, and things above those. */
export const elevation = {
  low: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  high: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
} as const;
