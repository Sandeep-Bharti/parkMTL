/**
 * Refreshing the data while the app is not running.
 *
 * The city republishes daily and the app is offline-first, so the moment a
 * driver actually needs it — standing on a street, maybe with no signal — is
 * the worst possible time to discover the data is a month old. The fetch
 * therefore happens on the OS's schedule, ahead of need.
 *
 * The OS decides when this runs, and may decide never; it is a best-effort
 * top-up, not a guarantee. `Check for updates` in settings is the path a user
 * can rely on.
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { DATA_BASE_URL, checkForUpdate, describeOutcome } from './updates.ts';
import { DATA_DIR, readRecord, writeRecord } from './data.ts';
import { artifactNames } from './installed.ts';

export const REFRESH_TASK = 'parkmtl-data-refresh';

TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    const installed = await readRecord();
    // Nothing installed yet means the app has never completed a first launch;
    // there is no build to compare against, so leave it to the foreground.
    if (!installed) return BackgroundTask.BackgroundTaskResult.Success;

    const outcome = await checkForUpdate(
      DATA_BASE_URL,
      DATA_DIR,
      installed.ruleDictVersion,
      artifactNames,
    );
    const note = describeOutcome(outcome);

    if (outcome.status === 'updated' && outcome.manifest) {
      // The files are in place; recording the new build is what makes the next
      // launch pick them up. Written only after the download succeeded.
      await writeRecord({
        ruleDictVersion: outcome.manifest.ruleDictVersion,
        exportDate: outcome.manifest.exportDate,
        builtAt: outcome.manifest.builtAt,
        source: 'download',
        lastCheckedAt: new Date().toISOString(),
        lastOutcome: note,
      });
    } else {
      await writeRecord({
        ...installed,
        lastCheckedAt: new Date().toISOString(),
        lastOutcome: note,
      });
    }

    // A missed refresh is reported as success on purpose: no signal or a server
    // hiccup is normal, and repeatedly reporting failure makes iOS back off
    // from scheduling the task at all.
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Ask the OS to run the refresh roughly daily.
 *
 * Registration is idempotent, so calling it on every launch is fine and keeps
 * the task alive across reinstalls.
 */
export async function registerRefresh(): Promise<void> {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(REFRESH_TASK);
    if (already) return;
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, {
      minimumInterval: 60 * 24, // minutes; the upstream feed moves once a day
    });
  } catch {
    // Background execution can be unavailable (simulator, low power mode, user
    // setting). The app is fully usable without it, so this is not an error
    // worth surfacing — the manual check in settings still works.
  }
}
