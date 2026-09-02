/**
 * The sentence the driver actually reads.
 *
 * These are worth testing because the failure mode is silent and expensive: a
 * deadline phrased wrongly reads as confident and correct, and the driver finds
 * out it was wrong from a ticket.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatDuration,
  formatTime,
  formatWhen,
  headline,
  subline,
} from '../src/format.ts';
import { translatorFor } from '../src/i18n.ts';
import type { Assessment } from '../../../packages/rules-core/src/index.ts';

const en = translatorFor('en');
const fr = translatorFor('fr');

/** Montreal is UTC-4 in September. 18:00 local = 22:00 UTC. */
const at = (iso: string) => new Date(iso);

describe('formatTime', () => {
  it('renders local Montreal time, not UTC', () => {
    assert.match(formatTime(at('2026-09-01T22:00:00Z'), 'en'), /^6:00 p\.?m\.?$/i);
  });

  it('tracks DST', () => {
    // Same UTC instant, January: EST, so an hour earlier locally.
    assert.match(formatTime(at('2026-01-15T22:00:00Z'), 'en'), /^5:00 p\.?m\.?$/i);
  });

  it('uses a 24-hour clock in French, as Quebec does', () => {
    const t = formatTime(at('2026-09-01T22:00:00Z'), 'fr');
    assert.match(t, /18/);
    assert.doesNotMatch(t, /p\.?m\.?/i);
  });
});

describe('formatWhen', () => {
  const now = at('2026-09-01T16:00:00Z'); // noon Montreal, Tuesday

  it('gives a bare time for later today', () => {
    assert.match(formatWhen(at('2026-09-01T22:00:00Z'), now, en), /6:00 p\.?m\.?$/i);
  });

  it('says tomorrow across a month boundary', () => {
    // Aug 31 -> Sep 1 is one day, though the date integers differ by 70.
    const evening = at('2026-08-31T16:00:00Z');
    const nextMorning = at('2026-09-01T13:30:00Z'); // 9:30am Sep 1 Montreal
    assert.match(formatWhen(nextMorning, evening, en), /tomorrow$/);
  });

  it('says demain in French', () => {
    const evening = at('2026-08-31T16:00:00Z');
    const nextMorning = at('2026-09-01T13:30:00Z');
    assert.match(formatWhen(nextMorning, evening, fr, 'fr'), /demain$/);
  });

  it('names the weekday for anything further out', () => {
    const thursday = at('2026-09-03T13:30:00Z');
    assert.match(formatWhen(thursday, now, en), /Thursday$/);
  });
});

describe('formatDuration', () => {
  it('reads minutes under an hour', () => {
    assert.equal(formatDuration(15), '15 min');
  });
  it('reads whole hours without a stray zero', () => {
    assert.equal(formatDuration(120), '2 h');
  });
  it('reads mixed durations', () => {
    assert.equal(formatDuration(90), '1 h 30');
  });
});

describe('headline', () => {
  it('never calls an unreadable sign clear', () => {
    assert.equal(headline('unknown', en), 'Check the sign');
    assert.notEqual(headline('unknown', en), headline('free', en));
  });

  it('translates the verdict but keeps the meaning distinct', () => {
    assert.equal(headline('unknown', fr), 'Vérifiez le panneau');
    assert.notEqual(headline('unknown', fr), headline('free', fr));
  });
});

describe('subline', () => {
  const now = at('2026-09-01T16:00:00Z');
  const base: Assessment = {
    status: 'free',
    active: [],
    until: null,
    next: null,
    needsVerification: false,
  };

  it('states permanence plainly rather than going blank', () => {
    assert.equal(subline({ ...base, status: 'no_parking' }, now, en), 'At all times');
    assert.equal(subline(base, now, en), 'No restrictions posted');
  });

  it('names the consequence, not just the deadline', () => {
    const s = subline(
      { ...base, status: 'free', until: at('2026-09-01T22:00:00Z'), next: 'no_parking' },
      now,
      en,
    );
    assert.match(s, /must move/);
  });

  it('says when a restriction lifts', () => {
    const s = subline(
      { ...base, status: 'no_parking', until: at('2026-09-01T22:00:00Z'), next: 'free' },
      now,
      en,
    );
    assert.match(s, /free after that/);
  });

  it('substitutes the time into the French template', () => {
    const s = subline(
      { ...base, status: 'free', until: at('2026-09-01T22:00:00Z'), next: 'no_parking' },
      now,
      fr,
      'fr',
    );
    assert.match(s, /^Jusqu'à 18/);
    assert.doesNotMatch(s, /\{when\}/);
  });
});
