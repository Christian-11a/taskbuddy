/**
 * The payment reminder pinned to every chat, and whether this device has
 * dismissed it. The choice is remembered per device in AsyncStorage, and kept
 * in memory for the rest of the session so a chat opened again does not wait
 * for storage. If storage cannot be read, the note simply shows again.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const SAFETY_NOTE_KEY = 'chat.safetyNote.dismissed';

/** What this session knows: true or false once read, null until then. */
let known: boolean | null = null;

/** Only the stored value "true" means the note was dismissed. */
export function isDismissedValue(raw: string | null): boolean {
  return raw === 'true';
}

/** Whether this device has dismissed the note. Storage that cannot be read counts as not dismissed. */
export async function loadSafetyNoteDismissed(): Promise<boolean> {
  try {
    return isDismissedValue(await AsyncStorage.getItem(SAFETY_NOTE_KEY));
  } catch {
    return false;
  }
}

/** The answer this session already has, or null before the device has been read. */
export function knownSafetyNoteDismissed(): boolean | null {
  return known;
}

/** The answer for this session. Reads the device the first time only. */
export async function rememberedSafetyNoteDismissed(): Promise<boolean> {
  if (known === null) known = await loadSafetyNoteDismissed();
  return known;
}

/** Remembers the dismissal on this device. If storage fails, the note shows again on the next app session. */
export async function saveSafetyNoteDismissed(): Promise<void> {
  known = true;
  try {
    await AsyncStorage.setItem(SAFETY_NOTE_KEY, 'true');
  } catch {
    // Nothing could be remembered on the device, so the note shows again next session.
  }
}

/** Forgets this session's answer, as a fresh app start would. For isolated tests. */
export function resetSafetyNoteMemoryForTests(): void {
  known = null;
}
