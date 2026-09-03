/**
 * Keeping the shipped data current.
 *
 * The city republishes signage daily, and a stale rule dictionary silently
 * mis-colours the map rather than failing — so refreshing is a correctness
 * feature, not a convenience.
 *
 * The rule that governs everything here: **tiles and dictionary move as a set.**
 * Each build stamps both with one `ruleDictVersion`, and a client pairing
 * yesterday's tiles with today's dictionary would paint confident nonsense.
 * So a partial download is discarded rather than half-applied.
 *
 * Only the parking data refreshes. The 62 MB basemap stays bundled: OSM
 * geometry does not go stale daily, and re-downloading it would dwarf the
 * 18 MB that actually changes.
 *
 * The decision logic lives in `manifest.ts`, which is pure. This module is the
 * I/O half, and imports the filesystem statically — an earlier version used a
 * dynamic `import()` to keep the decision testable, which is no longer needed
 * and cost a silent failure when the interop shape differed at runtime.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Directory, File } from 'expo-file-system';

import { shouldInstall, type Manifest, type UpdateOutcome } from './manifest.ts';

export {
  SUPPORTED_SCHEMA,
  describeOutcome,
  shouldInstall,
  type Manifest,
  type ManifestArtifact,
  type UpdateOutcome,
} from './manifest.ts';

/**
 * Where published data lives, or `null` when nothing is configured.
 *
 * Deliberately not defaulting to localhost. A shipped app pointing at
 * `http://localhost:8000` fails obscurely for every user; `null` lets the app
 * say plainly that no update source is configured.
 *
 * Must be **HTTPS** in a release build: the generated Info.plist sets
 * `NSAllowsArbitraryLoads = false`, so App Transport Security refuses cleartext
 * (`NSAllowsLocalNetworking` is why a local test server still works in the
 * simulator, and nothing else will).
 *
 * With GitHub Releases the stable base is:
 *   https://github.com/<owner>/parkmtl/releases/latest/download
 */
export const DATA_BASE_URL = process.env.EXPO_PUBLIC_DATA_URL ?? null;

interface DownloadTarget {
  /** Asset name at the publisher. */
  name: string;
  /** Name to store it under locally, which carries the build version. */
  localName: string;
  bytes: number;
}

/**
 * Fetch the manifest and, if it describes newer data, install it.
 *
 * Downloads land beside the live files and are moved into place only once every
 * file has arrived intact, so an interrupted update leaves the previous data
 * working rather than a half-swapped set.
 *
 * `names` are the *destination* names, which carry the incoming build's
 * version — not the current one. MapLibre keys its tile cache on the source
 * URL, so writing a new build to a path already in use risks serving the old
 * build's tiles from cache.
 */
export async function checkForUpdate(
  baseUrl: string | null,
  dataDir: string,
  currentVersion: string | null,
  namesFor: (ruleDictVersion: string) => { db: string; tiles: string },
): Promise<UpdateOutcome & { manifest?: Manifest }> {
  if (!baseUrl) return { status: 'not-configured' };

  let manifest: Manifest;
  try {
    const response = await fetch(`${baseUrl}/manifest.json`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) return { status: 'failed', reason: `HTTP ${response.status}` };
    manifest = (await response.json()) as Manifest;
  } catch (e) {
    return { status: 'failed', reason: `manifest: ${String((e as Error)?.message ?? e)}` };
  }

  const decision = shouldInstall(manifest, currentVersion);
  if (decision.status !== 'updated') return decision;

  const names = namesFor(manifest.ruleDictVersion);
  const targets: DownloadTarget[] = [
    { name: 'montreal.sqlite', localName: names.db, bytes: manifest.artifacts.db.bytes },
    {
      name: 'montreal.pmtiles',
      localName: names.tiles,
      bytes: manifest.artifacts.tiles!.bytes,
    },
  ];

  const staged: Array<{ from: string; to: string }> = [];
  try {
    const directory = new Directory(dataDir);

    for (const target of targets) {
      const incoming = `${target.localName}.incoming`;
      const tmp = `${dataDir}/${incoming}`;
      await FileSystem.deleteAsync(tmp, { idempotent: true });

      // The modern API rather than the legacy `downloadAsync`, which is
      // deprecated and, on this version, fails at the URLSession level with an
      // error carrying no reason — impossible to act on and easy to mistake for
      // a network problem.
      const downloaded = await File.downloadFileAsync(
        `${baseUrl}/${target.name}`,
        new File(directory, incoming),
      );

      // Size is the check cheap enough to always run. Hashing 15 MB in JS on a
      // phone is not, so a truncated or redirected download is caught here
      // rather than by a checksum we cannot afford.
      const size = downloaded.size ?? 0;
      if (size !== target.bytes) {
        throw new Error(`${target.name}: expected ${target.bytes} bytes, got ${size}`);
      }

      staged.push({ from: downloaded.uri, to: `${dataDir}/${target.localName}` });
    }
  } catch (e) {
    // Nothing has been swapped yet, so the previous data is still intact.
    for (const s of staged) await FileSystem.deleteAsync(s.from, { idempotent: true });
    return { status: 'failed', reason: String((e as Error)?.message ?? e) };
  }

  // Every file arrived and matched. Move as a set; the caller records the new
  // build only after this, so a crash here leaves the old record pointing at
  // the old files, which are still present.
  for (const s of staged) {
    await FileSystem.deleteAsync(s.to, { idempotent: true });
    await FileSystem.moveAsync({ from: s.from, to: s.to });
  }

  return { status: 'updated', exportDate: manifest.exportDate, manifest };
}
