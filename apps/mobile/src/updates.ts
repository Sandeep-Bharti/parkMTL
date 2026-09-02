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
 * Only the parking data refreshes. The 59 MB basemap stays bundled: OSM
 * geometry does not go stale daily, and re-downloading it would dwarf the
 * 18 MB that actually changes.
 */

/**
 * Where published data lives.
 *
 * Configurable because there is nowhere real to point it yet: the repository
 * has no remote, so no release exists. Overriding this with a local HTTP server
 * is how the update path is exercised end to end. Once CI publishes, this
 * becomes the release asset URL.
 */
export const DATA_BASE_URL =
  process.env.EXPO_PUBLIC_DATA_URL ?? 'http://localhost:8000';

export interface ManifestArtifact {
  bytes: number;
  sha256: string;
}

export interface Manifest {
  schemaVersion: number;
  exportDate: string;
  builtAt: string;
  ruleDictVersion: string;
  counts?: Record<string, number>;
  artifacts: {
    db: ManifestArtifact;
    tiles?: ManifestArtifact;
  };
}

/** The schema this build knows how to read. */
export const SUPPORTED_SCHEMA = 1;

export type UpdateOutcome =
  | { status: 'up-to-date' }
  | { status: 'updated'; exportDate: string }
  | { status: 'unsupported'; schemaVersion: number }
  | { status: 'incomplete' }
  | { status: 'failed'; reason: string };

/**
 * Whether a fetched manifest describes data this build should install.
 *
 * Split out from the download so the decision is testable without a network:
 * it is the part that can silently corrupt the map if it gets it wrong.
 */
export function shouldInstall(
  manifest: Manifest,
  currentVersion: string | null,
): UpdateOutcome {
  if (manifest.schemaVersion !== SUPPORTED_SCHEMA) {
    // A newer publisher format is not something to guess at — an old client
    // must decline rather than misread it.
    return { status: 'unsupported', schemaVersion: manifest.schemaVersion };
  }

  // Tiles are stamped into the manifest by a step that runs after the database
  // is built, so their absence means the release is still half-published.
  if (!manifest.artifacts.tiles) return { status: 'incomplete' };

  if (currentVersion !== null && manifest.ruleDictVersion === currentVersion) {
    return { status: 'up-to-date' };
  }

  return { status: 'updated', exportDate: manifest.exportDate };
}

interface DownloadTarget {
  name: string;
  artifact: ManifestArtifact;
}

/**
 * Fetch the manifest and, if it describes newer data, install it.
 *
 * Downloads land beside the live files and are moved into place only once
 * every file has arrived intact, so an interrupted update leaves the previous
 * data working rather than a half-swapped set.
 */
export async function checkForUpdate(
  baseUrl: string,
  dataDir: string,
  currentVersion: string | null,
): Promise<UpdateOutcome> {
  // Imported here rather than at module scope so `shouldInstall` — the part
  // that decides whether the map is about to be given mismatched data — stays
  // testable without a native runtime.
  const FileSystem = await import('expo-file-system/legacy');

  let manifest: Manifest;
  try {
    const response = await fetch(`${baseUrl}/manifest.json`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) return { status: 'failed', reason: `HTTP ${response.status}` };
    manifest = (await response.json()) as Manifest;
  } catch (e) {
    return { status: 'failed', reason: String((e as Error)?.message ?? e) };
  }

  const decision = shouldInstall(manifest, currentVersion);
  if (decision.status !== 'updated') return decision;

  const targets: DownloadTarget[] = [
    { name: 'montreal.sqlite', artifact: manifest.artifacts.db },
    { name: 'montreal.pmtiles', artifact: manifest.artifacts.tiles! },
  ];

  const staged: Array<{ from: string; to: string }> = [];
  try {
    for (const target of targets) {
      const tmp = `${dataDir}/${target.name}.incoming`;
      await FileSystem.deleteAsync(tmp, { idempotent: true });

      const result = await FileSystem.downloadAsync(`${baseUrl}/${target.name}`, tmp);
      if (result.status !== 200) {
        throw new Error(`${target.name}: HTTP ${result.status}`);
      }

      // Size is the check that is cheap enough to always run. Hashing 15 MB in
      // JS on a phone is not, so a truncated or redirected download is caught
      // here rather than by a checksum we cannot afford.
      const info = await FileSystem.getInfoAsync(tmp);
      const size = info.exists ? info.size : 0;
      if (size !== target.artifact.bytes) {
        throw new Error(
          `${target.name}: expected ${target.artifact.bytes} bytes, got ${size}`,
        );
      }

      staged.push({ from: tmp, to: `${dataDir}/${target.name}` });
    }
  } catch (e) {
    // Nothing has been swapped yet, so the previous data is still intact.
    for (const s of staged) await FileSystem.deleteAsync(s.from, { idempotent: true });
    return { status: 'failed', reason: String((e as Error)?.message ?? e) };
  }

  // Every file arrived and matched. Swap as a set.
  for (const s of staged) {
    await FileSystem.deleteAsync(s.to, { idempotent: true });
    await FileSystem.moveAsync({ from: s.from, to: s.to });
  }
  await FileSystem.writeAsStringAsync(`${dataDir}/VERSION`, manifest.ruleDictVersion);

  return { status: 'updated', exportDate: manifest.exportDate };
}
