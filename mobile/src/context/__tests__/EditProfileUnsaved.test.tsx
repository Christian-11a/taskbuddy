import React from 'react';
import { BackHandler, Modal } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import HOEditProfileScreen from '../../../app/(homeowner)/screens/HOEditProfileScreen';
import SPEditProfileScreen from '../../../app/(provider)/screens/SPEditProfileScreen';
import { useAuth } from '../AuthContext';
import { api } from '../../lib/api';

jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/api', () => ({
  api: {
    categories: jest.fn(),
    updateProfile: jest.fn(),
    upsertProviderProfile: jest.fn(),
  },
}));
jest.mock('../../components/AddressField', () => {
  const React = require('react');
  const { Text, TextInput } = require('react-native');
  return ({
    value,
    onChangeText,
    onResolve,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    onResolve: (value: unknown) => void;
  }) => (
    <>
      <TextInput testID="address" value={value} onChangeText={onChangeText} />
      {/* A suggestion that reads exactly like the saved address: only the pick itself changed. */}
      <Text
        onPress={() => {
          onChangeText('Old address');
          onResolve({
            latitude: 13.9417,
            longitude: 121.1631,
            formatted_address: 'Old address',
            city: 'Quezon City',
            location_reference: 'signed-point',
          });
        }}
      >
        Pick suggestion
      </Text>
    </>
  );
});

type Role = 'homeowner' | 'provider';

const PHONE_MESSAGE = 'You changed your phone number. If you leave now, that change is lost.';

/** Renders an editor and lets its async category load settle, so no state update lands after the test. */
async function renderEditor(role: Role, onBack = jest.fn(), onSave = jest.fn()) {
  const utils = role === 'homeowner'
    ? render(<HOEditProfileScreen onBack={onBack} onSave={onSave} />)
    : render(<SPEditProfileScreen onBack={onBack} onSave={onSave} onManageServices={jest.fn()} />);
  await act(async () => {});
  return utils;
}

/** The dialog that is open right now. The screen mounts a save and a leave modal; only one can be visible. */
function openDialog() {
  return screen.UNSAFE_getAllByType(Modal).find((modal) => modal.props.visible);
}

function backPressHandlers(spy: jest.SpyInstance) {
  return spy.mock.calls
    .filter(([eventName]) => eventName === 'hardwareBackPress')
    .map(([, handler]) => handler);
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({
    profile: {
      full_name: 'Alex',
      email: 'alex@example.com',
      phone: '09171234567',
      address: 'Old address',
      city: 'Quezon City',
      avatar_url: null,
    },
    providerProfile: {
      category_id: 1,
      bio: 'Experienced provider offering dependable home services',
      years_experience: 5,
      service_radius_km: 25,
    },
    refreshProfile: jest.fn().mockResolvedValue(undefined),
  });
  (api.categories as jest.Mock).mockResolvedValue([]);
  (api.updateProfile as jest.Mock).mockResolvedValue({});
  (api.upsertProviderProfile as jest.Mock).mockResolvedValue({});
});

describe.each<Role>(['homeowner', 'provider'])('%s edit profile leaving', (role) => {
  it('leaves at once from the back arrow when nothing changed', async () => {
    const onBack = jest.fn();
    await renderEditor(role, onBack);

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Leave without saving?')).toBeNull();
  });

  it('asks before leaving from the back arrow when a field changed', async () => {
    const onBack = jest.fn();
    await renderEditor(role, onBack);
    fireEvent.changeText(screen.getByLabelText('Phone (optional)'), '09990000000');

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText('Leave without saving?')).toBeTruthy();
    expect(screen.getByText(PHONE_MESSAGE)).toBeTruthy();
  });

  it('keeps the form when the person chooses Keep editing', async () => {
    const onBack = jest.fn();
    await renderEditor(role, onBack);
    fireEvent.changeText(screen.getByLabelText('Phone (optional)'), '09990000000');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    fireEvent.press(screen.getByLabelText('Keep editing'));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByText('Leave without saving?')).toBeNull();
    expect(screen.getByLabelText('Phone (optional)').props.value).toBe('09990000000');
  });

  it('treats Android back on the question as Keep editing, not as leaving', async () => {
    const onBack = jest.fn();
    await renderEditor(role, onBack);
    fireEvent.changeText(screen.getByLabelText('Phone (optional)'), '09990000000');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    fireEvent(openDialog()!, 'requestClose');

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByText('Leave without saving?')).toBeNull();
  });

  it('leaves when the person chooses Discard changes', async () => {
    const onBack = jest.fn();
    await renderEditor(role, onBack);
    fireEvent.changeText(screen.getByLabelText('Phone (optional)'), '09990000000');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    fireEvent.press(screen.getByLabelText('Discard changes'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('takes Android back only while something is unsaved, and asks instead of leaving', async () => {
    const add = jest.spyOn(BackHandler, 'addEventListener');
    const onBack = jest.fn();
    await renderEditor(role, onBack);
    expect(backPressHandlers(add)).toHaveLength(0);

    fireEvent.changeText(screen.getByLabelText('Phone (optional)'), '09990000000');
    const [handler] = backPressHandlers(add).slice(-1);
    let handled: boolean | null | undefined = false;
    act(() => {
      handled = handler?.();
    });

    expect(handled).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText(PHONE_MESSAGE)).toBeTruthy();
    add.mockRestore();
  });

  it('counts a picked address suggestion as unsaved even when its text is unchanged', async () => {
    const onBack = jest.fn();
    await renderEditor(role, onBack);
    fireEvent.press(screen.getByText('Pick suggestion'));

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText('You changed your address. If you leave now, that change is lost.')).toBeTruthy();
  });

  it('shows the name message under the field and does not save while the name is empty', async () => {
    await renderEditor(role);
    fireEvent.changeText(screen.getByLabelText('Full name'), '   ');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText('Full name cannot be empty.')).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('saves through the same confirmation with the same updateProfile payload', async () => {
    await renderEditor(role);
    fireEvent.changeText(screen.getByLabelText('Phone (optional)'), '09990000000');

    fireEvent.press(screen.getByLabelText('Save changes'));
    await act(async () => {
      fireEvent.press(within(screen.getByRole('alert')).getByLabelText('Save changes'));
    });

    expect(api.updateProfile).toHaveBeenCalledTimes(1);
    expect(api.updateProfile).toHaveBeenCalledWith({
      full_name: 'Alex',
      phone: '09990000000',
      address: 'Old address',
      city: 'Quezon City',
      location_reference: undefined,
    });
  });
});

it('does not take Android back on a clean provider form', async () => {
  const add = jest.spyOn(BackHandler, 'addEventListener');
  await renderEditor('provider');
  expect(backPressHandlers(add)).toHaveLength(0);
  add.mockRestore();
});

it('counts a changed bio as unsaved for a provider', async () => {
  const onBack = jest.fn();
  await renderEditor('provider', onBack);
  fireEvent.changeText(
    screen.getByLabelText('Bio (min 20 characters)'),
    'A reworded bio that is long enough to save',
  );

  fireEvent.press(screen.getByRole('button', { name: 'Back' }));

  expect(onBack).not.toHaveBeenCalled();
  expect(screen.getByText('You changed your bio. If you leave now, that change is lost.')).toBeTruthy();
});
