/**
 * The handful of things the app remembers between launches.
 *
 * Kept as files beside the data artifacts rather than pulling in a storage
 * dependency: there is exactly one flag, and the directory already exists.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { DATA_DIR } from './data.ts';

const ONBOARDED = `${DATA_DIR}/ONBOARDED`;

export async function hasOnboarded(): Promise<boolean> {
  try {
    return (await FileSystem.getInfoAsync(ONBOARDED)).exists;
  } catch {
    // A failure to read must not trap someone in onboarding forever; treat it
    // as "already seen" and let them get to the map.
    return true;
  }
}

export async function setOnboarded(): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true }).catch(() => {});
    await FileSystem.writeAsStringAsync(ONBOARDED, new Date().toISOString());
  } catch {
    // Worst case it shows again next launch — annoying, not broken.
  }
}
