import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SAFETY_NOTE_KEY,
  isDismissedValue,
  knownSafetyNoteDismissed,
  loadSafetyNoteDismissed,
  rememberedSafetyNoteDismissed,
  resetSafetyNoteMemoryForTests,
  saveSafetyNoteDismissed,
} from '../chatSafetyNote';

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  resetSafetyNoteMemoryForTests();
});

describe('chat safety note — remembered per device', () => {
  it('uses the agreed storage key', () => {
    expect(SAFETY_NOTE_KEY).toBe('chat.safetyNote.dismissed');
  });

  it('counts only a stored "true" as dismissed', () => {
    expect(isDismissedValue('true')).toBe(true);
    expect(isDismissedValue('false')).toBe(false);
    expect(isDismissedValue(null)).toBe(false);
  });

  it('is shown until it is dismissed, and stays dismissed afterwards', async () => {
    expect(await loadSafetyNoteDismissed()).toBe(false);

    await saveSafetyNoteDismissed();

    expect(await AsyncStorage.getItem(SAFETY_NOTE_KEY)).toBe('true');
    expect(await loadSafetyNoteDismissed()).toBe(true);
  });

  it('shows the note again when storage cannot be read', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

    expect(await loadSafetyNoteDismissed()).toBe(false);
  });

  it('does not fail when the dismissal cannot be saved', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

    await expect(saveSafetyNoteDismissed()).resolves.toBeUndefined();
  });
});

describe('chat safety note — remembered for the session', () => {
  it('knows nothing until the device has been read once', async () => {
    expect(knownSafetyNoteDismissed()).toBeNull();

    await AsyncStorage.setItem(SAFETY_NOTE_KEY, 'true');

    expect(await rememberedSafetyNoteDismissed()).toBe(true);
    expect(knownSafetyNoteDismissed()).toBe(true);
  });

  it('reads the device once, then answers from memory', async () => {
    const getItem = jest.spyOn(AsyncStorage, 'getItem');

    expect(await rememberedSafetyNoteDismissed()).toBe(false);
    expect(await rememberedSafetyNoteDismissed()).toBe(false);

    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it('counts a dismissal for the rest of the session at once', async () => {
    await saveSafetyNoteDismissed();

    expect(knownSafetyNoteDismissed()).toBe(true);
  });
});
