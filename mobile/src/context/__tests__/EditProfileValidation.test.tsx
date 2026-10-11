import React from 'react';
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
  const { Text, TextInput } = require('react-native');
  return ({
    value,
    onChangeText,
    onResolve,
    onBlur,
    error,
    maxLength,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    onResolve: (value: unknown) => void;
    onBlur?: () => void;
    error?: string;
    maxLength?: number;
  }) => (
    <>
      <TextInput testID="address" value={value} onChangeText={onChangeText} onBlur={onBlur} maxLength={maxLength} />
      {!!error && <Text accessibilityLiveRegion="polite">{error}</Text>}
      <Text
        onPress={() => {
          onChangeText('Old address');
          onResolve(null);
        }}
      >
        Pick suggestion
      </Text>
    </>
  );
});

type Role = 'homeowner' | 'provider';
const ROLES: Role[] = ['homeowner', 'provider'];

const PHONE_FORMAT = 'Enter an 11-digit mobile number starting with 09, e.g. 09171234567';

const BASE_PROFILE = {
  full_name: 'Alex',
  email: 'alex@example.com',
  phone: '09171234567',
  address: 'Old address',
  city: 'Quezon City',
  avatar_url: null,
};

/** Sets what the signed-in profile holds; `overrides` replace single fields, e.g. an older phone format. */
function mockProfile(overrides: Partial<typeof BASE_PROFILE> = {}) {
  (useAuth as jest.Mock).mockReturnValue({
    profile: { ...BASE_PROFILE, ...overrides },
    providerProfile: {
      category_id: 1,
      bio: 'Experienced provider offering dependable home services',
      years_experience: 5,
      service_radius_km: 25,
    },
    refreshProfile: jest.fn().mockResolvedValue(undefined),
  });
}

/** Renders an editor and lets its async category load settle, so no state update lands after the test. */
async function renderEditor(role: Role) {
  const utils = role === 'homeowner'
    ? render(<HOEditProfileScreen onBack={jest.fn()} onSave={jest.fn()} />)
    : render(<SPEditProfileScreen onBack={jest.fn()} onSave={jest.fn()} onManageServices={jest.fn()} />);
  await act(async () => {});
  return utils;
}

/** Presses Save and, when the confirmation opens, confirms it. */
async function saveAndConfirm() {
  fireEvent.press(screen.getByLabelText('Save changes'));
  await act(async () => {
    fireEvent.press(within(screen.getByRole('alert')).getByLabelText('Save changes'));
  });
}

const phoneField = () => screen.getByLabelText('Phone (optional)');

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile();
  (api.categories as jest.Mock).mockResolvedValue([]);
  (api.updateProfile as jest.Mock).mockResolvedValue({});
  (api.upsertProviderProfile as jest.Mock).mockResolvedValue({});
});

describe.each<Role>(ROLES)('%s edit profile phone', (role) => {
  it('shows the 09 placeholder, the 11-digit helper and a number pad', async () => {
    await renderEditor(role);

    expect(phoneField().props.placeholder).toBe('09XX XXX XXXX');
    expect(phoneField().props.keyboardType).toBe('number-pad');
    expect(screen.getByText('11 digits, starts with 09')).toBeTruthy();
  });

  it('keeps letters, spaces and symbols out of the phone field', async () => {
    await renderEditor(role);

    fireEvent.changeText(phoneField(), '0917-abc 123 4567!');

    expect(phoneField().props.value).toBe('09171234567');
  });

  it('leaves an empty phone field empty when only letters are typed', async () => {
    mockProfile({ phone: '' });
    await renderEditor(role);

    fireEvent.changeText(phoneField(), 'abc');

    expect(phoneField().props.value).toBe('');
  });

  it('turns a pasted +63 number into the 09 form', async () => {
    await renderEditor(role);

    fireEvent.changeText(phoneField(), '+63 917 123 4567');

    expect(phoneField().props.value).toBe('09171234567');
  });

  it('has no native length cap, so a pasted 21-character +63 number is read whole', async () => {
    mockProfile({ phone: '' });
    await renderEditor(role);
    expect(phoneField().props.maxLength).toBeUndefined();

    fireEvent.changeText(phoneField(), '+63 (0998) 765 - 4321');

    expect(phoneField().props.value).toBe('09987654321');
    await saveAndConfirm();
    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ phone: '09987654321' }));
  });

  it('keeps a pasted 12-digit number as it was pasted, and Save says why it cannot be sent', async () => {
    mockProfile({ phone: '' });
    await renderEditor(role);

    fireEvent.changeText(phoneField(), '091712345678');

    expect(phoneField().props.value).toBe('091712345678');
    fireEvent.press(screen.getByLabelText('Save changes'));
    expect(screen.getByText(PHONE_FORMAT)).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('does not show the phone message while the number is still being typed', async () => {
    await renderEditor(role);

    fireEvent.changeText(phoneField(), '0917');

    expect(screen.queryByText(PHONE_FORMAT)).toBeNull();
  });

  it('shows the phone message once the field is left', async () => {
    await renderEditor(role);
    fireEvent.changeText(phoneField(), '0917');

    fireEvent(phoneField(), 'blur');

    expect(screen.getByText(PHONE_FORMAT)).toBeTruthy();
  });

  it('blocks Save with the phone message for a 10-digit number', async () => {
    const onSave = jest.fn();
    render(
      role === 'homeowner'
        ? <HOEditProfileScreen onBack={jest.fn()} onSave={onSave} />
        : <SPEditProfileScreen onBack={jest.fn()} onSave={onSave} onManageServices={jest.fn()} />,
    );
    await act(async () => {});
    fireEvent.changeText(phoneField(), '0917123456');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(PHONE_FORMAT)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('lets an emptied phone be saved, because the phone is optional', async () => {
    await renderEditor(role);
    fireEvent.changeText(phoneField(), '');

    await saveAndConfirm();

    expect(screen.queryByText(PHONE_FORMAT)).toBeNull();
    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ phone: '' }));
  });

  it('sends the cleaned phone when the phone was changed', async () => {
    await renderEditor(role);
    fireEvent.changeText(phoneField(), '+63 998 765 4321');

    await saveAndConfirm();

    expect(api.updateProfile).toHaveBeenCalledTimes(1);
    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ phone: '09987654321' }));
  });

  it('does not block saving the name while an older phone format is left untouched', async () => {
    mockProfile({ phone: '+63 917 123 4567' });
    await renderEditor(role);
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Alex Reyes');

    await saveAndConfirm();

    expect(screen.queryByText(PHONE_FORMAT)).toBeNull();
    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      full_name: 'Alex Reyes',
      phone: '+63 917 123 4567',
    }));
  });
});

const NAME_NUMBERS = "Full name can't include numbers";
const NAME_SHORT = 'Full name must be at least 2 characters';
const NAME_EMPTY = 'Enter your full name';

describe.each<Role>(ROLES)('%s edit profile name', (role) => {
  it('shows the name message once the name field is left, not while typing', async () => {
    await renderEditor(role);

    fireEvent.changeText(screen.getByLabelText('Full name'), 'A');
    expect(screen.queryByText(NAME_SHORT)).toBeNull();

    fireEvent(screen.getByLabelText('Full name'), 'blur');
    expect(screen.getByText(NAME_SHORT)).toBeTruthy();
  });

  it('blocks Save for digits in the name, and says why', async () => {
    await renderEditor(role);
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Alex 2');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(NAME_NUMBERS)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('blocks Save for a name made only of spaces', async () => {
    await renderEditor(role);
    fireEvent.changeText(screen.getByLabelText('Full name'), '   ');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(NAME_EMPTY)).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('blocks Save for a one-letter name', async () => {
    await renderEditor(role);
    fireEvent.changeText(screen.getByLabelText('Full name'), 'A');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(NAME_SHORT)).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('sends the name trimmed, with single spaces between words', async () => {
    await renderEditor(role);
    fireEvent.changeText(screen.getByLabelText('Full name'), '  Alex   Reyes  ');

    await saveAndConfirm();

    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Alex Reyes' }));
  });

  it('does not block saving other fields while an older name with digits is left untouched', async () => {
    mockProfile({ full_name: 'Test 02' });
    await renderEditor(role);
    fireEvent.changeText(phoneField(), '09990000000');

    await saveAndConfirm();

    expect(screen.queryByText(NAME_NUMBERS)).toBeNull();
    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      full_name: 'Test 02',
      phone: '09990000000',
    }));
  });
});

const ADDRESS_SHORT = 'Address must be at least 5 characters';
const CITY_SHORT = 'City must be at least 2 characters';
const SP_ADDRESS_REQUIRED = 'Enter your address so nearby jobs can be matched to you.';
const cityField = () => screen.getByPlaceholderText('City / Municipality');

describe.each<Role>(ROLES)('%s edit profile address and city', (role) => {
  it('shows the address message once the address is left, not while typing', async () => {
    await renderEditor(role);

    fireEvent.changeText(screen.getByTestId('address'), 'Lipa');
    expect(screen.queryByText(ADDRESS_SHORT)).toBeNull();

    fireEvent(screen.getByTestId('address'), 'blur');
    expect(screen.getByText(ADDRESS_SHORT)).toBeTruthy();
  });

  it('blocks Save for an address shorter than five characters', async () => {
    await renderEditor(role);
    fireEvent.changeText(screen.getByTestId('address'), 'Lipa');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(ADDRESS_SHORT)).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('blocks Save for a city of one letter', async () => {
    await renderEditor(role);
    fireEvent.changeText(cityField(), 'C');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(CITY_SHORT)).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('accepts a short Philippine city such as Lipa', async () => {
    await renderEditor(role);
    fireEvent.changeText(cityField(), 'Lipa');

    await saveAndConfirm();

    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ city: 'Lipa' }));
  });

  it('sends the city with single spaces between its words', async () => {
    await renderEditor(role);
    fireEvent.changeText(cityField(), '  Lapu   Lapu City ');

    await saveAndConfirm();

    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ city: 'Lapu Lapu City' }));
  });

  it('does not block saving while an older short address or city is left untouched', async () => {
    mockProfile({ address: 'Ok', city: 'Q' });
    await renderEditor(role);
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Alex Reyes');

    await saveAndConfirm();

    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ address: 'Ok', city: 'Q' }));
  });
});

describe('provider edit profile address', () => {
  it('asks for an address, because nearby jobs are matched from it', async () => {
    await renderEditor('provider');
    fireEvent.changeText(screen.getByTestId('address'), '');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(SP_ADDRESS_REQUIRED)).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });
});

describe('homeowner edit profile address', () => {
  it('allows an empty address, because the address is optional on the homeowner profile', async () => {
    await renderEditor('homeowner');
    fireEvent.changeText(screen.getByTestId('address'), '');

    await saveAndConfirm();

    expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ address: '' }));
  });
});

const RADIUS_RANGE = 'Enter a service radius from 0.5 to 1000 km';
const radiusField = () => screen.getByLabelText('Service radius (km)');

describe('provider edit profile service radius', () => {
  it('refuses a radius below 0.5 km, and says why, without saving', async () => {
    await renderEditor('provider');
    fireEvent.changeText(radiusField(), '0');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(RADIUS_RANGE)).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(api.upsertProviderProfile).not.toHaveBeenCalled();
  });

  it('refuses a radius above 1000 km', async () => {
    await renderEditor('provider');
    fireEvent.changeText(radiusField(), '1500');

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(RADIUS_RANGE)).toBeTruthy();
    expect(api.upsertProviderProfile).not.toHaveBeenCalled();
  });

  it('sends a radius inside the range as a number', async () => {
    await renderEditor('provider');
    fireEvent.changeText(radiusField(), '8');

    await saveAndConfirm();

    expect(api.upsertProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ service_radius_km: 8 }));
  });

  it('keeps the stored radius when the field is left alone', async () => {
    await renderEditor('provider');
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Alex Reyes');

    await saveAndConfirm();

    expect(api.upsertProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ service_radius_km: 25 }));
  });
});

describe.each<Role>(ROLES)('%s edit profile field limits', (role) => {
  it('stops the full name at 120 characters', async () => {
    await renderEditor(role);
    expect(screen.getByLabelText('Full name').props.maxLength).toBe(120);
  });

  it('stops the city at 80 characters', async () => {
    await renderEditor(role);
    expect(screen.getByLabelText('City').props.maxLength).toBe(80);
  });

  it('stops the address at 200 characters', async () => {
    await renderEditor(role);
    expect(screen.getByTestId('address').props.maxLength).toBe(200);
  });
});

const BIO_MIN_MESSAGE = 'Bio must be at least 20 characters.';
const bioField = () => screen.getByLabelText('Bio (min 20 characters)');

describe('provider edit profile bio', () => {
  it('limits the bio to 400 characters and counts them as they are typed', async () => {
    await renderEditor('provider');
    const typed = 'Plumber for eight years';

    fireEvent.changeText(bioField(), typed);

    expect(bioField().props.maxLength).toBe(400);
    expect(screen.getByText(`${typed.length} / 400`)).toBeTruthy();
  });

  it('says the bio is too short once it is left, and blocks Save', async () => {
    await renderEditor('provider');
    fireEvent.changeText(bioField(), 'Plumbing and drain.');

    fireEvent(bioField(), 'blur');

    expect(screen.getByText(BIO_MIN_MESSAGE)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save changes'));
    expect(api.upsertProviderProfile).not.toHaveBeenCalled();
  });

  it('treats a bio of only spaces as empty: too short, and nothing is sent', async () => {
    await renderEditor('provider');
    fireEvent.changeText(bioField(), ' '.repeat(25));

    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(BIO_MIN_MESSAGE)).toBeTruthy();
    expect(api.upsertProviderProfile).not.toHaveBeenCalled();
  });

  it('accepts a bio of exactly 20 characters', async () => {
    await renderEditor('provider');
    fireEvent.changeText(bioField(), 'Plumbing and drains.');

    await saveAndConfirm();

    expect(api.upsertProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ bio: 'Plumbing and drains.' }));
  });

  it('sends the bio trimmed, with the extra blank lines inside it closed up', async () => {
    await renderEditor('provider');
    fireEvent.changeText(bioField(), '  Ten years of plumbing work.\n\n\n\nFully insured.  \n');

    await saveAndConfirm();

    expect(api.upsertProviderProfile).toHaveBeenCalledWith(
      expect.objectContaining({ bio: 'Ten years of plumbing work.\n\nFully insured.' }),
    );
  });
});
