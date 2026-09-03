/**
 * What a published build declares, and whether to install it.
 *
 * Pure by design: this is the part that decides whether the map is about to be
 * handed mismatched data, so it must be testable without a device. Keeping it
 * separate is also why `updates.ts` can import the filesystem normally instead
 * of reaching for a dynamic import.
 */

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
  | { status: 'not-configured' }
  | { status: 'up-to-date' }
  | { status: 'updated'; exportDate: string }
  | { status: 'unsupported'; schemaVersion: number }
  | { status: 'incomplete' }
  | { status: 'failed'; reason: string };

/**
 * Whether a fetched manifest describes data this build should install.
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

/** One-line description of an outcome, for the record and for settings. */
export function describeOutcome(outcome: UpdateOutcome): string {
  switch (outcome.status) {
    case 'updated':
      return `updated to ${outcome.exportDate}`;
    case 'unsupported':
      return `unsupported schema ${outcome.schemaVersion}`;
    case 'failed':
      return `failed: ${outcome.reason}`;
    default:
      return outcome.status;
  }
}
