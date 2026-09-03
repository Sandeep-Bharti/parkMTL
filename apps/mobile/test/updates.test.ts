/**
 * The decision to install new data.
 *
 * Isolated from the download on purpose: this is the part that can quietly
 * corrupt the map. Tiles and dictionary must move as a set, and a client that
 * mixes builds paints confident nonsense rather than failing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldInstall, SUPPORTED_SCHEMA, type Manifest } from '../src/manifest.ts';

const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  schemaVersion: SUPPORTED_SCHEMA,
  exportDate: '2026-09-01',
  builtAt: '2026-09-01T10:00:00Z',
  ruleDictVersion: 'sha256:new',
  artifacts: {
    db: { bytes: 15_667_200, sha256: 'sha256:db' },
    tiles: { bytes: 3_038_907, sha256: 'sha256:tiles' },
  },
  ...over,
});

describe('shouldInstall', () => {
  it('installs when the dictionary version has moved on', () => {
    assert.deepEqual(shouldInstall(manifest(), 'sha256:old'), {
      status: 'updated',
      exportDate: '2026-09-01',
    });
  });

  it('does nothing when the version already matches', () => {
    assert.deepEqual(shouldInstall(manifest(), 'sha256:new'), { status: 'up-to-date' });
  });

  it('installs on a first run, when nothing is stamped yet', () => {
    assert.equal(shouldInstall(manifest(), null).status, 'updated');
  });

  it('refuses a release whose tiles have not been published yet', () => {
    // build.ts writes the manifest, then a separate step stamps the tileset in.
    // Downloading between the two would pair a new dictionary with old tiles.
    const halfPublished = manifest();
    delete halfPublished.artifacts.tiles;
    assert.deepEqual(shouldInstall(halfPublished, 'sha256:old'), { status: 'incomplete' });
  });

  it('declines a schema it does not understand rather than guessing', () => {
    assert.deepEqual(shouldInstall(manifest({ schemaVersion: 2 }), 'sha256:old'), {
      status: 'unsupported',
      schemaVersion: 2,
    });
  });

  it('checks the schema before anything else', () => {
    // An unreadable manifest must not be reported as "up to date" just because
    // the version string happens to match.
    const future = manifest({ schemaVersion: 99, ruleDictVersion: 'sha256:same' });
    assert.equal(shouldInstall(future, 'sha256:same').status, 'unsupported');
  });
});
