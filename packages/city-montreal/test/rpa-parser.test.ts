import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRpa } from '../src/rpa-parser.ts';

/**
 * Every input below is a verbatim string from the Ville de Montréal corpus,
 * with its sign count noted where it is a high-frequency form.
 */

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6, SUN = 0;
const h = (hours: number, minutes = 0) => hours * 60 + minutes;

describe('action markers', () => {
  it('reads \\P as a parking prohibition', () => {
    assert.equal(parseRpa('\\P EN TOUT TEMPS').action, 'no_parking');
  });

  it('reads \\A as the stricter standing prohibition', () => {
    assert.equal(parseRpa('\\A EN TOUT TEMPS').action, 'no_standing');
  });

  it('reads bare P as permitted parking', () => {
    assert.equal(parseRpa('P 15 min').action, 'parking_allowed');
  });

  it('survives the doubled backslash seen in some boroughs', () => {
    const r = parseRpa('\\\\P 12h30-15h30 MERCREDI 1 AVRIL AU 1 DEC');
    assert.equal(r.action, 'no_parking');
    assert.equal(r.confidence, 'full');
  });

  it('survives lowercase and run-together forms', () => {
    // Real corpus entry, unspaced after the marker and entirely lowercase.
    const r = parseRpa('\\p13h - 17h mercredi 1er mars - 1er déc');
    assert.equal(r.action, 'no_parking');
    assert.deepEqual(r.clauses[0].times, [{ start: h(13), end: h(17) }]);
    assert.deepEqual(r.clauses[0].weekdays, [WED]);
  });
});

describe('time ranges', () => {
  it('parses hours and half hours', () => {
    // 1,128 signs.
    const r = parseRpa('\\P 8h30-11h30 MERCREDI 1 AVRIL AU 1 DEC');
    assert.deepEqual(r.clauses[0].times, [{ start: h(8, 30), end: h(11, 30) }]);
  });

  it('expands the "9-23h" shorthand', () => {
    const r = parseRpa('\\P 9-23h EXCEPTE S3R (2 SECTEURS)');
    assert.deepEqual(r.clauses[0].times, [{ start: h(9), end: h(23) }]);
  });

  it('records a range that crosses midnight without reordering it', () => {
    const r = parseRpa('\\P 19h-7h');
    assert.deepEqual(r.clauses[0].times, [{ start: h(19), end: h(7) }]);
  });

  it('parses two ranges joined by ET', () => {
    const r = parseRpa('\\P 7h30-9h ET 14h30-16h30 LUN A VEN');
    assert.deepEqual(r.clauses[0].times, [
      { start: h(7, 30), end: h(9) },
      { start: h(14, 30), end: h(16, 30) },
    ]);
    assert.deepEqual(r.clauses[0].weekdays, [MON, TUE, WED, THU, FRI]);
  });

  it('accepts À as a range separator', () => {
    const r = parseRpa('8H À 17H - LUN MER VEN');
    assert.deepEqual(r.clauses[0].times, [{ start: h(8), end: h(17) }]);
    assert.deepEqual(r.clauses[0].weekdays, [MON, WED, FRI]);
  });
});

describe('weekdays', () => {
  it('expands an abbreviated range with trailing periods', () => {
    const r = parseRpa('\\A 15h30-18h30 LUN. AU VEN.');
    assert.deepEqual(r.clauses[0].weekdays, [MON, TUE, WED, THU, FRI]);
  });

  it('reads a bare list of days', () => {
    const r = parseRpa('\\P 9h30-10h30 MARDI VENDREDI 1 AVRIL AU 1 DEC');
    assert.deepEqual(r.clauses[0].weekdays, [TUE, FRI]);
  });

  it('wraps a day range across Sunday', () => {
    const r = parseRpa('\\P 9h-18h SAM AU LUN');
    assert.deepEqual(r.clauses[0].weekdays, [SUN, MON, SAT]);
  });
});

describe('multi-clause signs', () => {
  it('splits differing hours for differing days', () => {
    const r = parseRpa('\\P 18h-3h LUN A VEN ET 9h-3h SAM DIM EXCEPTE S3R');
    assert.equal(r.clauses.length, 2);

    assert.deepEqual(r.clauses[0].times, [{ start: h(18), end: h(3) }]);
    assert.deepEqual(r.clauses[0].weekdays, [MON, TUE, WED, THU, FRI]);

    assert.deepEqual(r.clauses[1].times, [{ start: h(9), end: h(3) }]);
    assert.deepEqual(r.clauses[1].weekdays, [SUN, SAT]);

    assert.equal(r.exemptions[0].kind, 'permit_resident');
  });

  it('splits a clause list with no ET between the groups', () => {
    const r = parseRpa('P 60 min 09h-18h LUN. MAR. MER. SAM. 09h-21h JEU. VEN.');
    assert.equal(r.maxDurationMin, 60);
    assert.equal(r.clauses.length, 2);
    assert.deepEqual(r.clauses[0].weekdays, [MON, TUE, WED, SAT]);
    assert.deepEqual(r.clauses[1].times, [{ start: h(9), end: h(21) }]);
    assert.deepEqual(r.clauses[1].weekdays, [THU, FRI]);
  });
});

describe('duration caps', () => {
  it('reads an explicit minute cap', () => {
    const r = parseRpa('P 15 min 07h-18h LUN. AU VEN.');
    assert.equal(r.maxDurationMin, 15);
    assert.deepEqual(r.clauses[0].times, [{ start: h(7), end: h(18) }]);
  });

  it('reads an hour cap followed by a range', () => {
    const r = parseRpa('P 2h 8h - 22h');
    assert.equal(r.maxDurationMin, 120);
    assert.deepEqual(r.clauses[0].times, [{ start: h(8), end: h(22) }]);
  });

  it('does not swallow the next hour as minutes of the cap', () => {
    // The zero-padded form is the trap: a greedy optional-minutes match reads
    // "02h 09" as 2:09am, turning a 2h cap + 9am-6pm window into nonsense.
    const r = parseRpa('P 02h 09h-18h LUN. A SAM.');
    assert.equal(r.maxDurationMin, 120);
    assert.deepEqual(r.clauses[0].times, [{ start: h(9), end: h(18) }]);
    assert.deepEqual(r.clauses[0].weekdays, [MON, TUE, WED, THU, FRI, SAT]);
    assert.equal(r.confidence, 'full');
  });

  it('reads a cap with no window as an all-times allowance', () => {
    const r = parseRpa('P 04h');
    assert.equal(r.maxDurationMin, 240);
    assert.deepEqual(r.clauses, []);
    assert.equal(r.confidence, 'full');
  });

  it('resolves the spurious separator in "P 2H - 8H @ 18H"', () => {
    const r = parseRpa('P 2H - 8H @ 18H LUN AU VEN');
    assert.equal(r.maxDurationMin, 120);
    assert.deepEqual(r.clauses[0].times, [{ start: h(8), end: h(18) }]);
  });
});

describe('seasons', () => {
  it('parses the standard spaced form', () => {
    const r = parseRpa('\\P 8h30-11h30 MERCREDI 1 AVRIL AU 1 DEC');
    assert.deepEqual(r.season, { from: { month: 4, day: 1 }, to: { month: 12, day: 1 } });
  });

  it('parses the unspaced form', () => {
    const r = parseRpa('\\P 8h30-11h30 LUNDI 1AVRIL AU 1DEC');
    assert.deepEqual(r.season, { from: { month: 4, day: 1 }, to: { month: 12, day: 1 } });
  });

  it('parses the ordinal-and-dash form', () => {
    const r = parseRpa('\\P 8h - 12h VENDREDI 1ER AVRIL - 30 NOV');
    assert.deepEqual(r.season, { from: { month: 4, day: 1 }, to: { month: 11, day: 30 } });
  });

  it('parses a month-to-month window as whole months', () => {
    const r = parseRpa('P 15 min 07h-09h LUN A VEN SEPT. A JUIN');
    assert.deepEqual(r.season, { from: { month: 9, day: 1 }, to: { month: 6, day: 30 } });
  });

  it('does not mistake the month MARS for the weekday MAR', () => {
    const r = parseRpa('\\P 13h-17h MERCREDI 1er MARS - 1er DEC');
    assert.deepEqual(r.season, { from: { month: 3, day: 1 }, to: { month: 12, day: 1 } });
    assert.deepEqual(r.clauses[0].weekdays, [WED]);
  });
});

describe('exemptions', () => {
  it('recognises the residential permit code', () => {
    const r = parseRpa('\\P 9h-23h EXCEPTE S3R');
    assert.deepEqual(r.exemptions.map((e) => e.kind), ['permit_resident']);
  });

  it('captures the permit sector where the sign names one', () => {
    const r = parseRpa('PANONCEAU EXCEPTÉ DETENTEURS DE PERMIS SECTEUR XX');
    assert.equal(r.action, 'informational');
  });

  it('recognises accessible-parking carve-outs', () => {
    const r = parseRpa('\\P EXCEPTE HANDICAPES (PICTO)');
    assert.deepEqual(r.exemptions.map((e) => e.kind), ['disabled']);
    assert.equal(r.confidence, 'full');
  });

  it('recognises an EV charging bay', () => {
    const r = parseRpa(
      '\\P EXCEPTE PICTOGRAMME VOITURE ELECTRIQUE - EN RECHARGE',
    );
    assert.deepEqual(r.exemptions.map((e) => e.kind), ['ev_charging']);
  });

  it('keeps an exemption that appears before the schedule', () => {
    const r = parseRpa('\\P EXCEPTE HANDICAPES 9h-21h LUN A SAM');
    assert.deepEqual(r.exemptions.map((e) => e.kind), ['disabled']);
    assert.deepEqual(r.clauses[0].times, [{ start: h(9), end: h(21) }]);
    assert.deepEqual(r.clauses[0].weekdays, [MON, TUE, WED, THU, FRI, SAT]);
  });
});

describe('vehicle targeting', () => {
  it('reads "AUX CAMIONS" as narrowing the prohibition to trucks', () => {
    const r = parseRpa('\\P AUX CAMIONS');
    assert.equal(r.appliesToVehicle, 'truck');
    assert.equal(r.exemptions.length, 0);
  });

  it('reads "EXCEPTE MOTOS" as an exemption, not a target', () => {
    const r = parseRpa('\\P EXCEPTE MOTOS');
    assert.equal(r.appliesToVehicle, undefined);
    assert.deepEqual(r.exemptions.map((e) => e.kind), ['motorcycle']);
  });
});

describe('unconditional and informational signs', () => {
  it('treats EN TOUT TEMPS as always in force', () => {
    const r = parseRpa('\\A EN TOUT TEMPS');
    assert.deepEqual(r.clauses, []);
    assert.equal(r.confidence, 'full');
  });

  it('treats a bare action marker with a spatial qualifier as always in force', () => {
    // 1,132 signs. "DEUX COTES" says where, not when.
    const r = parseRpa('\\P DEUX COTES');
    assert.equal(r.action, 'no_parking');
    assert.deepEqual(r.clauses, []);
    assert.equal(r.confidence, 'full');
  });

  it('classifies pay-station markers as informational', () => {
    assert.equal(parseRpa('PARCOMETRE').action, 'informational');
    assert.equal(parseRpa('STATIONNEMENT TARIFÉ').action, 'informational');
  });

  it('flags school-day-only signs rather than guessing the calendar', () => {
    const r = parseRpa("\\A 8h-9h30 ET 15h-16h JOURS D`ECOLE");
    assert.equal(r.schoolDaysOnly, true);
  });
});

describe('confidence', () => {
  it('always preserves the source text', () => {
    const raw = '\\P EXCEPTE SERVICE D\'INCENDIE';
    assert.equal(parseRpa(raw).raw, raw);
  });

  it('marks a sign partial when the schedule parses but some text does not', () => {
    const r = parseRpa('\\P 07h-19h CLIGNOTANT 19h-07h FIXE');
    assert.notEqual(r.confidence, 'none');
    assert.ok(r.clauses.length > 0);
  });

  it('marks free text with no recoverable schedule as unparsed', () => {
    const r = parseRpa(
      'STATIONNEMENT RESERVE AUX USAGERS DE L\'ARENA - REMORQUAGE A VOS FRAIS',
    );
    assert.equal(r.confidence, 'none');
    assert.ok((r.unparsed?.length ?? 0) > 0);
  });
});
