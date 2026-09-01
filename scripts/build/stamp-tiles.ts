/**
 * Record the built tileset in the manifest.
 *
 *   node --experimental-strip-types scripts/build/stamp-tiles.ts [--out data/out]
 *
 * Split from build.ts because tiles come from tippecanoe, which runs between
 * the two. Until this has run the manifest carries no `tiles` entry, and the
 * app treats that as "not published yet" rather than downloading a half-built
 * release.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const outDir = (
  arg('--out') ?? fileURLToPath(new URL('../../data/out/', import.meta.url))
).replace(/\/+$/, '');

const manifestPath = `${outDir}/manifest.json`;
const tilesPath = `${outDir}/montreal.pmtiles`;

if (!existsSync(manifestPath)) {
  console.error(`no manifest at ${manifestPath} — run 'npm run build' first`);
  process.exit(1);
}
if (!existsSync(tilesPath)) {
  console.error(`no tileset at ${tilesPath} — run 'npm run tiles' first`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.artifacts.tiles = {
  bytes: statSync(tilesPath).size,
  sha256: `sha256:${createHash('sha256').update(readFileSync(tilesPath)).digest('hex')}`,
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`stamped tiles (${manifest.artifacts.tiles.bytes} bytes) into ${manifestPath}`);
