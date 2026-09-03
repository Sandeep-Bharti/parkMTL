/**
 * Which copy of the data the app should be running.
 *
 * The app carries data in its bundle *and* can download newer data, so on every
 * launch it has to decide between them. Getting that decision wrong is not a
 * cosmetic bug: the previous version compared the stored version to the bundled
 * one for equality and deleted everything on a mismatch, which meant a
 * successful download was destroyed at the next launch and the app silently
 * reverted to whatever shipped in the binary.
 *
 * The lesson is in the comparison. Equality can only say *different*; it cannot
 * say *newer*. So the record below carries an orderable field and the decision
 * is made on recency.
 *
 * Kept free of native imports so the decision is a pure function and can be
 * tested without a device — the same reason `shouldInstall` is.
 */

export interface InstalledRecord {
  ruleDictVersion: string;
  /** `YYYY-MM-DD` from the upstream feed. */
  exportDate: string;
  /** ISO instant the artifacts were built. The primary ordering key. */
  builtAt: string;
  /** Where this copy came from, for display and debugging. */
  source: 'bundle' | 'download';
  /** ISO instant of the last update check, to rate-limit them. */
  lastCheckedAt?: string;
  /**
   * What the last check concluded, in one line.
   *
   * Persisted rather than only logged: a release build has no console, so
   * without this a refresh that quietly fails is invisible both to a user
   * wondering why their data is old and to anyone debugging it.
   */
  lastOutcome?: string;
}

/** Just enough of a manifest to compare two builds. */
export interface BuildStamp {
  ruleDictVersion: string;
  exportDate: string;
  builtAt?: string;
}

/**
 * Order two builds. Positive when `a` is newer.
 *
 * `builtAt` is the real answer — two builds on the same export date are ordered
 * by when they were built. `exportDate` is the fallback for a manifest written
 * before `builtAt` existed.
 */
export function compareBuilds(a: BuildStamp, b: BuildStamp): number {
  if (a.builtAt && b.builtAt && a.builtAt !== b.builtAt) {
    return a.builtAt < b.builtAt ? -1 : 1;
  }
  if (a.exportDate !== b.exportDate) return a.exportDate < b.exportDate ? -1 : 1;
  return 0;
}

/**
 * Whether the copy shipped in the app bundle should replace what is installed.
 *
 * Only when the bundle is strictly newer. A downloaded copy that is newer than
 * the bundle — the normal state of affairs once the app has been running for a
 * day — is left alone.
 */
export function shouldInstallBundle(
  bundled: BuildStamp,
  installed: InstalledRecord | null,
): boolean {
  if (!installed) return true;

  // Same build: nothing to do, and in particular nothing to delete.
  if (installed.ruleDictVersion === bundled.ruleDictVersion) return false;

  return compareBuilds(bundled, installed) > 0;
}

/** Short, filesystem-safe form of a version hash, for naming artifacts. */
export function shortVersion(ruleDictVersion: string): string {
  return ruleDictVersion.replace(/^sha256:/, '').slice(0, 12);
}

/** Artifact file names for a given build, so a new build never reuses a URL. */
export function artifactNames(ruleDictVersion: string): {
  db: string;
  tiles: string;
} {
  const v = shortVersion(ruleDictVersion);
  return { db: `montreal-${v}.sqlite`, tiles: `montreal-${v}.pmtiles` };
}

/** Whether enough time has passed to be worth asking the server again. */
export function dueForCheck(
  installed: InstalledRecord | null,
  now: Date,
  minIntervalHours = 6,
): boolean {
  if (!installed?.lastCheckedAt) return true;
  const last = Date.parse(installed.lastCheckedAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= minIntervalHours * 3_600_000;
}

/** Parse a stored record, treating anything malformed as absent. */
export function parseRecord(text: string | null): InstalledRecord | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<InstalledRecord>;
    if (
      typeof parsed.ruleDictVersion !== 'string' ||
      typeof parsed.exportDate !== 'string' ||
      typeof parsed.builtAt !== 'string'
    ) {
      return null;
    }
    return {
      ruleDictVersion: parsed.ruleDictVersion,
      exportDate: parsed.exportDate,
      builtAt: parsed.builtAt,
      source: parsed.source === 'download' ? 'download' : 'bundle',
      ...(parsed.lastCheckedAt ? { lastCheckedAt: parsed.lastCheckedAt } : {}),
      ...(parsed.lastOutcome ? { lastOutcome: parsed.lastOutcome } : {}),
    };
  } catch {
    // A corrupt record must not wedge the app; reinstalling the bundle is a
    // safe, if wasteful, recovery.
    return null;
  }
}
