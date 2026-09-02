/**
 * Turning an Assessment into words a driver can act on.
 *
 * The whole product is one sentence — "you can park here until 6 PM" — so this
 * file decides how honest and how readable that sentence is. Two rules run
 * through all of it: never round a deadline *up* (a spot that expires at 5:58
 * must not read "6 PM"), and never state a time so precisely that it implies
 * more certainty than the data has.
 */

import type { Assessment, Status } from '@parkmtl/rules-core';
import { TIME_ZONE } from '@parkmtl/city-montreal';

import type { Language, Translator } from './i18n.ts';

const LOCALE: Record<Language, string> = { en: 'en-CA', fr: 'fr-CA' };

/** Intl formatters are expensive to build, so each variant is made once. */
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(lang: Language, kind: 'time' | 'day' | 'key'): Intl.DateTimeFormat {
  const cacheKey = `${lang}:${kind}`;
  let found = cache.get(cacheKey);
  if (!found) {
    const base = { timeZone: TIME_ZONE } as const;
    found = new Intl.DateTimeFormat(
      LOCALE[lang],
      kind === 'time'
        ? { ...base, hour: 'numeric', minute: '2-digit', hour12: lang === 'en' }
        : kind === 'day'
          ? { ...base, weekday: 'long' }
          : { ...base, year: 'numeric', month: '2-digit', day: '2-digit' },
    );
    cache.set(cacheKey, found);
  }
  return found;
}

/** "6:00 p.m." in English, "18 h 00" in French. */
export function formatTime(date: Date, lang: Language = 'en'): string {
  return formatter(lang, 'time').format(date).replace(/\s+/g, ' ');
}

/**
 * Local calendar day as a day number, for deciding whether to say "tomorrow".
 *
 * Counts real days rather than subtracting YYYYMMDD integers, which would make
 * the last day of a month look 70 days from the first of the next.
 */
function dayIndex(date: Date, lang: Language): number {
  const parts = formatter(lang, 'key').formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Math.round(Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000);
}

/**
 * "6:00 p.m.", "9:30 a.m. tomorrow", or the weekday for anything further out.
 * A bare clock time two days away would be read as today.
 */
export function formatWhen(target: Date, now: Date, t: Translator, lang: Language = 'en'): string {
  const time = formatTime(target, lang);
  const days = dayIndex(target, lang) - dayIndex(now, lang);

  if (days === 0) return time;
  if (days === 1) return t('sub.tomorrow', { time });
  return `${time} ${formatter(lang, 'day').format(target)}`;
}

/** "2 h", "45 min", "1 h 30" — how long a maxDuration allows. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

export function headline(status: Status, t: Translator): string {
  return t(`verdict.${status}` as const);
}

/**
 * The second line: when this changes, and to what.
 *
 * `until === null` means nothing changes within the 48h horizon, which for a
 * permanent restriction is the truth and should be said plainly rather than
 * left blank.
 */
export function subline(
  assessment: Assessment,
  now: Date,
  t: Translator,
  lang: Language = 'en',
): string {
  const { status, until, next } = assessment;

  if (until === null) {
    return status === 'free' ? t('sub.none') : t('sub.always');
  }

  const when = formatWhen(until, now, t, lang);

  // Naming the consequence is the useful half: "until 6 PM" leaves the driver
  // to guess whether 6 PM is when they get towed or when it gets better.
  switch (next) {
    case 'no_parking':
    case 'no_standing':
      return t('sub.untilMove', { when });
    case 'free':
      return t('sub.untilFree', { when });
    case null:
      return t('sub.until', { when });
    default:
      return t('sub.untilThen', {
        when,
        status: t(`verdict.${next}` as const).toLowerCase(),
      });
  }
}
