/**
 * Choosing between the bundled copy and a downloaded one.
 *
 * This is the decision that was wrong: the app compared versions for equality
 * and deleted on mismatch, so every successful update was destroyed at the next
 * launch. The regression test for that is `keeps a downloaded copy that is
 * newer than the bundle` — if it ever fails again, updates silently stop
 * sticking and the app quietly runs on whatever shipped in the binary.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  artifactNames,
  compareBuilds,
  dueForCheck,
  parseRecord,
  shouldInstallBundle,
  shortVersion,
  type BuildStamp,
  type InstalledRecord,
} from '../src/installed.ts';

const bundle: BuildStamp = {
  ruleDictVersion: 'sha256:aaa',
  exportDate: '2026-08-27',
  builtAt: '2026-09-01T01:00:00.000Z',
};

const record = (over: Partial<InstalledRecord> = {}): InstalledRecord => ({
  ruleDictVersion: 'sha256:aaa',
  exportDate: '2026-08-27',
  builtAt: '2026-09-01T01:00:00.000Z',
  source: 'bundle',
  ...over,
});

describe('shouldInstallBundle', () => {
  it('installs the bundle on a first run', () => {
    assert.equal(shouldInstallBundle(bundle, null), true);
  });

  it('does nothing when the installed copy is the bundled one', () => {
    assert.equal(shouldInstallBundle(bundle, record()), false);
  });

  it('keeps a downloaded copy that is newer than the bundle', () => {
    // The regression. Previously this mismatch triggered a full wipe of the
    // data directory and a revert to the binary's copy.
    const downloaded = record({
      ruleDictVersion: 'sha256:bbb',
      exportDate: '2026-09-02',
      builtAt: '2026-09-02T10:00:00.000Z',
      source: 'download',
    });
    assert.equal(shouldInstallBundle(bundle, downloaded), false);
  });

  it('installs the bundle when an app update ships fresher data', () => {
    const stale = record({
      ruleDictVersion: 'sha256:old',
      exportDate: '2026-07-01',
      builtAt: '2026-07-01T10:00:00.000Z',
      source: 'download',
    });
    assert.equal(shouldInstallBundle(bundle, stale), true);
  });

  it('orders same-day rebuilds by build time', () => {
    const sameDayOlder = record({
      ruleDictVersion: 'sha256:ccc',
      exportDate: '2026-08-27',
      builtAt: '2026-08-31T01:00:00.000Z',
      source: 'download',
    });
    assert.equal(shouldInstallBundle(bundle, sameDayOlder), true);
  });

  it('falls back to export date when a record predates builtAt', () => {
    assert.equal(
      compareBuilds(
        { ruleDictVersion: 'a', exportDate: '2026-09-02' },
        { ruleDictVersion: 'b', exportDate: '2026-08-27' },
      ),
      1,
    );
  });
});

describe('parseRecord', () => {
  it('treats corrupt or absent records as absent, so the app recovers', () => {
    assert.equal(parseRecord(null), null);
    assert.equal(parseRecord('not json'), null);
    assert.equal(parseRecord('{"ruleDictVersion":"x"}'), null);
  });

  it('round-trips a real record', () => {
    const parsed = parseRecord(JSON.stringify(record({ source: 'download' })));
    assert.equal(parsed?.source, 'download');
    assert.equal(parsed?.ruleDictVersion, 'sha256:aaa');
  });

  it('a corrupt record means install the bundle rather than wedge', () => {
    assert.equal(shouldInstallBundle(bundle, parseRecord('{{{')), true);
  });
});

describe('artifactNames', () => {
  it('names files by build, so a new build never reuses a URL', () => {
    // MapLibre keys its tile cache on the source URL; reusing a path risks
    // serving the previous build's tiles from cache.
    const a = artifactNames('sha256:4848053560383');
    const b = artifactNames('sha256:ffffffffffffff');
    assert.notEqual(a.tiles, b.tiles);
    assert.match(a.db, /^montreal-[0-9a-f]{12}\.sqlite$/);
    assert.match(a.tiles, /^montreal-[0-9a-f]{12}\.pmtiles$/);
  });

  it('strips the algorithm prefix from the name', () => {
    assert.equal(shortVersion('sha256:abcdef0123456789'), 'abcdef012345');
  });
});

describe('dueForCheck', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');

  it('checks when nothing has been checked yet', () => {
    assert.equal(dueForCheck(null, now), true);
    assert.equal(dueForCheck(record(), now), true);
  });

  it('waits out the interval', () => {
    const recent = record({ lastCheckedAt: '2026-09-02T09:00:00.000Z' });
    assert.equal(dueForCheck(recent, now, 6), false);
  });

  it('checks again once the interval has passed', () => {
    const old = record({ lastCheckedAt: '2026-09-02T02:00:00.000Z' });
    assert.equal(dueForCheck(old, now, 6), true);
  });

  it('checks when the timestamp is unreadable', () => {
    assert.equal(dueForCheck(record({ lastCheckedAt: 'nonsense' }), now), true);
  });
});
