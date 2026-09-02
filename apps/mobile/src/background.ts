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
import * as FileSystem from 'expo-file-system/legacy';

import { DATA_BASE_URL, checkForUpdate } from './updates.ts';
import { DATA_DIR } from './data.ts';

export const REFRESH_TASK = 'parkmtl-data-refresh';

/**
 * The version currently on disk, or null when nothing has been installed.
 * Read from the stamp rather than from the database so the check costs nothing.
 */
async function installedVersion(): Promise<string | null> {
  try {
    const stamp = await FileSystem.getInfoAsync(`${DATA_DIR}/VERSION`);
    if (!stamp.exists) return null;
    return await FileSystem.readAsStringAsync(`${DATA_DIR}/VERSION`);
  } catch {
    return null;
  }
}

TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    const outcome = await checkForUpdate(DATA_BASE_URL, DATA_DIR, await installedVersion());

    // `Failed` is reported as success to the OS on purpose: a missed refresh is
    // normal (no signal, server down) and repeatedly reporting failure makes
    // the system back off from scheduling us at all.
    return outcome.status === 'updated'
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Success;
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
