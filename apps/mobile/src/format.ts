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

const timeFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  weekday: 'long',
});

const dateKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "6:00 p.m." */
export function formatTime(date: Date): string {
  return timeFormat.format(date).replace(/\s+/g, ' ');
}

/**
 * Local calendar day as a day number, for deciding whether to say "tomorrow".
 *
 * Counts real days rather than subtracting YYYYMMDD integers, which would make
 * the last day of a month look 70 days from the first of the next.
 */
function dayIndex(date: Date): number {
  // en-CA formats as YYYY-MM-DD, so the parts are already in order.
  const [year, month, day] = dateKeyFormat.format(date).split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * "6:00 p.m.", "9:30 a.m. tomorrow", or the weekday for anything further out.
 * A bare clock time two days away would be read as today.
 */
export function formatWhen(target: Date, now: Date): string {
  const time = formatTime(target);
  const days = dayIndex(target) - dayIndex(now);

  if (days === 0) return time;
  if (days === 1) return `${time} tomorrow`;
  return `${time} ${dayFormat.format(target)}`;
}

/** "2 h", "45 min", "1 h 30" — how long a maxDuration allows. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

const HEADLINE: Record<Status, string> = {
  free: 'You can park here',
  paid: 'Paid parking',
  limited: 'Limited parking',
  permit_only: 'Permit holders only',
  no_parking: 'No parking',
  no_standing: 'No stopping',
  unknown: 'Check the sign',
};

export function headline(status: Status): string {
  return HEADLINE[status];
}

/**
 * The second line: when this changes, and to what.
 *
 * `until === null` means nothing changes within the 48h horizon, which for a
 * permanent restriction is the truth and should be said plainly rather than
 * left blank.
 */
export function subline(assessment: Assessment, now: Date): string {
  const { status, until, next } = assessment;

  if (until === null) {
    return status === 'free' ? 'No restrictions posted' : 'At all times';
  }

  const when = formatWhen(until, now);

  // Naming the consequence is the useful half: "until 6 PM" leaves the driver
  // to guess whether 6 PM is when they get towed or when it gets better.
  switch (next) {
    case 'no_parking':
    case 'no_standing':
      return `Until ${when}, then you must move`;
    case 'free':
      return `Until ${when} — free after that`;
    case null:
      return `Until ${when}`;
    default:
      return `Until ${when}, then ${HEADLINE[next].toLowerCase()}`;
  }
}
