import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ChatSafetyNote from '../ChatSafetyNote';
import { SAFETY_NOTE_KEY, resetSafetyNoteMemoryForTests } from '../../lib/chatSafetyNote';

const COPY = "Keep payments in TaskBuddy. Money paid outside the app isn't protected, and TaskBuddy can't refund it.";

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  resetSafetyNoteMemoryForTests();
});

describe('ChatSafetyNote — the payment reminder pinned at the top of a chat', () => {
  it('shows the reminder on a device that has not dismissed it', async () => {
    render(<ChatSafetyNote />);

    expect(await screen.findByText('Stay protected')).toBeTruthy();
    expect(screen.getByText(COPY)).toBeTruthy();
  });

  it('hides after Got it, and stays hidden when the app is opened again', async () => {
    const first = render(<ChatSafetyNote />);
    fireEvent.press(await screen.findByRole('button', { name: 'Got it' }));

    expect(screen.queryByText('Stay protected')).toBeNull();
    await waitFor(async () => expect(await AsyncStorage.getItem(SAFETY_NOTE_KEY)).toBe('true'));
    first.unmount();

    // A new app session reads the device again, so the choice must come from storage.
    resetSafetyNoteMemoryForTests();
    render(<ChatSafetyNote />);
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(SAFETY_NOTE_KEY));
    await act(async () => {});
    expect(screen.queryByText('Stay protected')).toBeNull();
  });

  it('a chat opened again in the same session shows the reminder at once', async () => {
    const first = render(<ChatSafetyNote />);
    expect(await screen.findByText('Stay protected')).toBeTruthy();
    first.unmount();

    render(<ChatSafetyNote />);
    expect(screen.getByText('Stay protected')).toBeTruthy();
  });

  it('does not read storage again once the choice is made in this session', async () => {
    const first = render(<ChatSafetyNote />);
    fireEvent.press(await screen.findByRole('button', { name: 'Got it' }));
    first.unmount();
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    getItem.mockClear();

    render(<ChatSafetyNote />);

    expect(screen.queryByText('Stay protected')).toBeNull();
    expect(getItem).not.toHaveBeenCalled();
  });

  it('still shows the reminder when storage cannot be read', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

    render(<ChatSafetyNote />);

    expect(await screen.findByText('Stay protected')).toBeTruthy();
  });

  it('still hides the reminder for this session when the choice cannot be saved', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
    render(<ChatSafetyNote />);

    fireEvent.press(await screen.findByRole('button', { name: 'Got it' }));

    expect(screen.queryByText('Stay protected')).toBeNull();
  });
});
