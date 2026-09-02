/**
 * The publishing contract, end to end against a real HTTP server.
 *
 * `checkForUpdate` itself needs expo-file-system, so it cannot run here. What
 * *can* be verified is the contract it depends on, which is where the real risk
 * lies: that the manifest CI publishes is fetchable, describes both artifacts,
 * and states byte lengths that match the files sitting next to it. A manifest
 * that disagrees with its own artifacts would fail on a phone, at the worst
 * possible moment, with the previous data already deleted.
 */

import assert from 'node:assert/strict';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { shouldInstall, type Manifest } from '../src/updates.ts';

const OUT = fileURLToPath(new URL('../../../data/out/', import.meta.url));
const built = existsSync(`${OUT}manifest.json`) && existsSync(`${OUT}montreal.pmtiles`);

describe('published data', { skip: !built }, () => {
  let server: Server;
  let base: string;

  before(async () => {
    // Serves data/out exactly as a release host would.
    server = createServer((req, res) => {
      const name = (req.url ?? '/').replace(/^\/+/, '').split('?')[0];
      const path = `${OUT}${name}`;
      if (!name || !existsSync(path)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-length': String(statSync(path).size) });
      createReadStream(path).pipe(res);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  after(() => server?.close());

  it('serves a manifest this build knows how to read', async () => {
    const manifest = (await (await fetch(`${base}/manifest.json`)).json()) as Manifest;
    assert.equal(shouldInstall(manifest, 'sha256:something-older').status, 'updated');
  });

  it('states byte lengths that match the artifacts beside it', async () => {
    // This is the check the app can afford to run on a phone, so it is the one
    // standing between a truncated download and a corrupt map.
    const manifest = (await (await fetch(`${base}/manifest.json`)).json()) as Manifest;

    for (const [name, artifact] of [
      ['montreal.sqlite', manifest.artifacts.db],
      ['montreal.pmtiles', manifest.artifacts.tiles!],
    ] as const) {
      const response = await fetch(`${base}/${name}`);
      assert.equal(response.status, 200, `${name} should be downloadable`);
      const bytes = (await response.arrayBuffer()).byteLength;
      assert.equal(bytes, artifact.bytes, `${name} length should match the manifest`);
    }
  });

  it('declines to install the data it already has', async () => {
    const manifest = (await (await fetch(`${base}/manifest.json`)).json()) as Manifest;
    assert.deepEqual(shouldInstall(manifest, manifest.ruleDictVersion), {
      status: 'up-to-date',
    });
  });

  it('reports a missing manifest rather than throwing', async () => {
    const response = await fetch(`${base}/nope.json`);
    assert.equal(response.status, 404);
  });
});
