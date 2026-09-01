import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assess,
  clauseActiveAt,
  inSeason,
  ruleActiveAt,
  ruleStatus,
  statusByRuleId,
  toLocal,
} from '../src/evaluate.ts';
import type { Rule } from '../src/types.ts';
import { mostRestrictive } from '../src/types.ts';

const TZ = 'America/Toronto'; // same offsets and DST rules as America/Montreal

function rule(partial: Partial<Rule>): Rule {
  return {
    id: 0,
    action: 'no_parking',
    clauses: [],
    exemptions: [],
    raw: 'test',
    confidence: 'full',
    ...partial,
  };
}

/** Build an instant from Montreal wall-clock time. */
function local(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm = 0,
  offset = '-04:00',
): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(
    `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${offset}`,
  );
}

describe('toLocal', () => {
  it('reads wall-clock time in the target zone', () => {
    const t = toLocal(local(2026, 6, 17, 9, 30), TZ);
    assert.equal(t.year, 2026);
    assert.equal(t.month, 6);
    assert.equal(t.day, 17);
    assert.equal(t.minutes, 9 * 60 + 30);
    assert.equal(t.weekday, 3); // Wednesday
  });

  it('normalises midnight to minute 0, not 1440', () => {
    assert.equal(toLocal(local(2026, 6, 17, 0, 0), TZ).minutes, 0);
  });

  it('tracks DST: the same UTC instant is a different local hour in Jan vs Jul', () => {
    const january = toLocal(new Date('2026-01-15T17:00:00Z'), TZ);
    const july = toLocal(new Date('2026-07-15T17:00:00Z'), TZ);
    assert.equal(january.minutes, 12 * 60); // EST, UTC-5
    assert.equal(july.minutes, 13 * 60); // EDT, UTC-4
  });
});

describe('inSeason', () => {
  const aprilToDecember = { from: { month: 4, day: 1 }, to: { month: 12, day: 1 } };

  it('includes both endpoints', () => {
    assert.ok(inSeason(aprilToDecember, toLocal(local(2026, 4, 1, 12), TZ)));
    assert.ok(inSeason(aprilToDecember, toLocal(local(2026, 12, 1, 12), TZ)));
  });

  it('excludes dates outside the window', () => {
    assert.ok(!inSeason(aprilToDecember, toLocal(local(2026, 3, 31, 12), TZ)));
    assert.ok(!inSeason(aprilToDecember, toLocal(local(2026, 12, 2, 12), TZ)));
  });

  it('handles a window that wraps the new year', () => {
    const winter = { from: { month: 11, day: 1 }, to: { month: 4, day: 1 } };
    assert.ok(inSeason(winter, toLocal(local(2026, 1, 15, 12), TZ)));
    assert.ok(inSeason(winter, toLocal(local(2026, 12, 15, 12), TZ)));
    assert.ok(!inSeason(winter, toLocal(local(2026, 7, 15, 12), TZ)));
  });
});

describe('clauseActiveAt', () => {
  it('matches a plain daytime range', () => {
    const clause = { times: [{ start: 9 * 60, end: 23 * 60 }], weekdays: [] };
    assert.ok(clauseActiveAt(clause, toLocal(local(2026, 6, 17, 10), TZ)));
    assert.ok(!clauseActiveAt(clause, toLocal(local(2026, 6, 17, 8), TZ)));
  });

  it('is inclusive of the start minute and exclusive of the end', () => {
    const clause = { times: [{ start: 9 * 60, end: 23 * 60 }], weekdays: [] };
    assert.ok(clauseActiveAt(clause, toLocal(local(2026, 6, 17, 9, 0), TZ)));
    assert.ok(!clauseActiveAt(clause, toLocal(local(2026, 6, 17, 23, 0), TZ)));
  });

  it('covers both halves of a range that crosses midnight', () => {
    const clause = { times: [{ start: 19 * 60, end: 7 * 60 }], weekdays: [] };
    assert.ok(clauseActiveAt(clause, toLocal(local(2026, 6, 17, 20), TZ)));
    assert.ok(clauseActiveAt(clause, toLocal(local(2026, 6, 17, 3), TZ)));
    assert.ok(!clauseActiveAt(clause, toLocal(local(2026, 6, 17, 12), TZ)));
  });

  it('attributes the morning tail of a midnight-crossing range to the previous day', () => {
    // "\P 19h-7h LUN" runs Monday evening into Tuesday morning.
    const clause = { times: [{ start: 19 * 60, end: 7 * 60 }], weekdays: [1] };
    const mondayEvening = local(2026, 6, 15, 20); // Mon
    const tuesdayMorning = local(2026, 6, 16, 3); // Tue
    const mondayMorning = local(2026, 6, 15, 3); // Mon

    assert.ok(clauseActiveAt(clause, toLocal(mondayEvening, TZ)));
    assert.ok(clauseActiveAt(clause, toLocal(tuesdayMorning, TZ)));
    // Monday 3am belongs to Sunday's window, which this sign does not cover.
    assert.ok(!clauseActiveAt(clause, toLocal(mondayMorning, TZ)));
  });

  it('treats an empty time list as all day', () => {
    const clause = { times: [], weekdays: [3] };
    assert.ok(clauseActiveAt(clause, toLocal(local(2026, 6, 17, 4), TZ)));
    assert.ok(!clauseActiveAt(clause, toLocal(local(2026, 6, 18, 4), TZ)));
  });
});

describe('ruleActiveAt', () => {
  it('respects the seasonal window', () => {
    const r = rule({
      clauses: [{ times: [{ start: 510, end: 690 }], weekdays: [3] }],
      season: { from: { month: 4, day: 1 }, to: { month: 12, day: 1 } },
    });
    assert.ok(ruleActiveAt(r, toLocal(local(2026, 6, 17, 9), TZ))); // Wed, June
    assert.ok(!ruleActiveAt(r, toLocal(local(2026, 1, 21, 9), TZ))); // Wed, January
    assert.ok(!ruleActiveAt(r, toLocal(local(2026, 6, 16, 9), TZ))); // Tue, June
  });

  it('treats a rule with no clauses as always in force', () => {
    assert.ok(ruleActiveAt(rule({}), toLocal(local(2026, 2, 3, 4), TZ)));
  });

  it('never activates informational signs', () => {
    const r = rule({ action: 'informational' });
    assert.ok(!ruleActiveAt(r, toLocal(local(2026, 6, 17, 9), TZ)));
  });
});

describe('ruleStatus', () => {
  it('maps a residential-permit exemption to permit_only', () => {
    const r = rule({ exemptions: [{ kind: 'permit_resident', raw: 'S3R' }] });
    assert.equal(ruleStatus(r), 'permit_only');
  });

  it('keeps an unrelated exemption as a plain prohibition', () => {
    const r = rule({ exemptions: [{ kind: 'taxi', raw: 'TAXIS' }] });
    assert.equal(ruleStatus(r), 'no_parking');
  });

  it('imposes nothing on a car when the sign targets trucks', () => {
    const r = rule({ appliesToVehicle: 'truck' });
    assert.equal(ruleStatus(r), null);
  });

  it('distinguishes a duration cap from unrestricted parking', () => {
    assert.equal(ruleStatus(rule({ action: 'parking_allowed' })), 'free');
    assert.equal(
      ruleStatus(rule({ action: 'parking_allowed', maxDurationMin: 120 })),
      'limited',
    );
  });
});

describe('mostRestrictive', () => {
  it('orders statuses by severity', () => {
    assert.equal(mostRestrictive(['free', 'limited', 'no_parking']), 'no_parking');
    assert.equal(mostRestrictive(['free', 'paid']), 'paid');
    assert.equal(mostRestrictive(['no_standing', 'no_parking']), 'no_standing');
  });

  it('lets unknown outrank everything, so an unreadable sign is never called clear', () => {
    assert.equal(mostRestrictive(['free', 'unknown', 'no_parking']), 'unknown');
  });
});

describe('assess', () => {
  const wednesdayRushHour = rule({
    id: 1,
    clauses: [{ times: [{ start: 8 * 60 + 30, end: 11 * 60 + 30 }], weekdays: [3] }],
    season: { from: { month: 4, day: 1 }, to: { month: 12, day: 1 } },
    raw: '\\P 8h30-11h30 MERCREDI 1 AVRIL AU 1 DEC',
  });

  it('reports the restriction and when it lifts', () => {
    const result = assess([wednesdayRushHour], local(2026, 6, 17, 9), {
      timeZone: TZ,
    });
    assert.equal(result.status, 'no_parking');
    assert.equal(result.next, 'free');
    assert.equal(toLocal(result.until!, TZ).minutes, 11 * 60 + 30);
  });

  it('reports when a currently-clear spot becomes restricted', () => {
    const result = assess([wednesdayRushHour], local(2026, 6, 17, 7), {
      timeZone: TZ,
    });
    assert.equal(result.status, 'free');
    assert.equal(result.next, 'no_parking');
    assert.equal(toLocal(result.until!, TZ).minutes, 8 * 60 + 30);
  });

  it('returns no transition when nothing changes within the horizon', () => {
    const result = assess([rule({ action: 'no_parking' })], local(2026, 6, 17, 9), {
      timeZone: TZ,
    });
    assert.equal(result.status, 'no_parking');
    assert.equal(result.until, null);
  });

  it('reports paid rather than free for a paid space with no active restriction', () => {
    const result = assess([], local(2026, 6, 17, 9), { timeZone: TZ, paid: true });
    assert.equal(result.status, 'paid');
  });

  it('refuses to call a spot clear when any sign failed to parse', () => {
    const unreadable = rule({ confidence: 'none', raw: 'STAT MUNICIPAL - 48H' });
    const result = assess([unreadable], local(2026, 6, 17, 9), { timeZone: TZ });
    assert.equal(result.status, 'unknown');
    assert.ok(result.needsVerification);
  });

  it('flags partial parses for verification without discarding the schedule', () => {
    const partial = rule({
      confidence: 'partial',
      clauses: [{ times: [{ start: 540, end: 660 }], weekdays: [] }],
    });
    const result = assess([partial], local(2026, 6, 17, 10), { timeZone: TZ });
    assert.equal(result.status, 'no_parking');
    assert.ok(result.needsVerification);
  });

  it('surfaces the most restrictive of several signs on one pole', () => {
    const result = assess(
      [
        rule({ id: 1, action: 'parking_allowed', maxDurationMin: 120 }),
        rule({ id: 2, action: 'no_standing' }),
      ],
      local(2026, 6, 17, 9),
      { timeZone: TZ },
    );
    assert.equal(result.status, 'no_standing');
    assert.equal(result.active[0].action, 'no_standing');
  });

  it('finds a transition across the spring DST jump', () => {
    // 2026-03-08: Montreal clocks skip 02:00 -> 03:00.
    const overnight = rule({
      clauses: [{ times: [{ start: 1 * 60, end: 5 * 60 }], weekdays: [] }],
    });
    const result = assess([overnight], local(2026, 3, 8, 1, 30, '-05:00'), {
      timeZone: TZ,
    });
    assert.equal(result.status, 'no_parking');
    // The window still ends at 5am wall-clock despite the skipped hour.
    assert.equal(toLocal(result.until!, TZ).minutes, 5 * 60);
  });
});

describe('statusByRuleId', () => {
  it('resolves the whole dictionary in one pass for map colouring', () => {
    const rules = [
      rule({ id: 1, clauses: [{ times: [{ start: 540, end: 660 }], weekdays: [] }] }),
      rule({ id: 2, action: 'parking_allowed' }),
      rule({ id: 3, confidence: 'none' }),
      rule({ id: 4, action: 'informational' }),
    ];
    const map = statusByRuleId(rules, local(2026, 6, 17, 10), TZ);

    assert.equal(map.get(1), 'no_parking');
    assert.equal(map.get(2), 'free');
    assert.equal(map.get(3), 'unknown');
    assert.equal(map.has(4), false); // informational signs are not coloured
  });

  it('reports a rule as free outside its window', () => {
    const rules = [
      rule({ id: 1, clauses: [{ times: [{ start: 540, end: 660 }], weekdays: [] }] }),
    ];
    assert.equal(
      statusByRuleId(rules, local(2026, 6, 17, 14), TZ).get(1),
      'free',
    );
  });
});
