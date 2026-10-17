import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SPEditProfileScreen from '../SPEditProfileScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { expectSavedCopyIgnored } from '../../../../src/testing/savedCopy';

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../../src/lib/api', () => ({
  api: {
    categories: jest.fn(),
    updateProfile: jest.fn(),
    upsertProviderProfile: jest.fn(),
  },
}));

const RADIUS_MESSAGE = 'Choose 1 to 50 km';
const radiusInput = () => screen.getByLabelText('Service radius (km)');
const increase = () => screen.getByLabelText('Increase radius');
const decrease = () => screen.getByLabelText('Decrease radius');

function mockProviderWithRadius(service_radius_km: number | null) {
  (useAuth as jest.Mock).mockReturnValue({
    profile: { id: 'sp-sam', full_name: 'Sam Reyes', email: 'sam@example.com', phone: null, city: 'Cebu', address: null },
    providerProfile: {
      category_id: 1,
      service_categories: { id: 1, name: 'Plumbing' },
      service_radius_km,
      bio: null,
      years_experience: null,
    },
    refreshProfile: jest.fn(),
  });
}

function renderScreen() {
  return render(<SPEditProfileScreen onBack={jest.fn()} onSave={jest.fn()} onManageServices={jest.fn()} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  mockProviderWithRadius(25);
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
});

it('a saved service list of the wrong shape is ignored, and the screen loads as it does with nothing saved', async () => {
  (api.categories as jest.Mock).mockReturnValue(new Promise(() => {}));

  await expectSavedCopyIgnored('categories', {}, () => renderScreen());
});

describe('service radius stepper', () => {
  it('shows the stored radius with a km unit and steps by 1', () => {
    renderScreen();

    expect(radiusInput().props.value).toBe('25');
    expect(screen.getByText('km')).toBeTruthy();

    fireEvent.press(increase());
    expect(radiusInput().props.value).toBe('26');

    fireEvent.press(decrease());
    fireEvent.press(decrease());
    expect(radiusInput().props.value).toBe('24');
  });

  it('long press steps by 5 and does not also step by 1 on release', () => {
    renderScreen();

    fireEvent(increase(), 'longPress');
    expect(radiusInput().props.value).toBe('30');

    fireEvent.press(increase());
    expect(radiusInput().props.value).toBe('30');

    fireEvent.press(increase());
    expect(radiusInput().props.value).toBe('31');

    fireEvent(decrease(), 'longPress');
    expect(radiusInput().props.value).toBe('26');
  });

  it('disables − at 1 km and + at 50 km, and neither goes past the bounds', () => {
    mockProviderWithRadius(50);
    const { unmount } = renderScreen();

    expect(increase().props.accessibilityState).toMatchObject({ disabled: true });
    expect(decrease().props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent(increase(), 'longPress');
    fireEvent.press(increase());
    expect(radiusInput().props.value).toBe('50');
    unmount();

    mockProviderWithRadius(1);
    renderScreen();

    expect(decrease().props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(decrease());
    fireEvent(decrease(), 'longPress');
    expect(radiusInput().props.value).toBe('1');
  });
});

describe('service radius typing', () => {
  it('clamps a value above 50 to 50 on blur and shows the message', () => {
    renderScreen();

    fireEvent.changeText(radiusInput(), '80');
    expect(screen.queryByText(RADIUS_MESSAGE)).toBeNull();

    fireEvent(radiusInput(), 'blur');
    expect(radiusInput().props.value).toBe('50');
    expect(screen.getByText(RADIUS_MESSAGE)).toBeTruthy();
  });

  it('clamps 0 to 1 on blur and shows the message', () => {
    renderScreen();

    fireEvent.changeText(radiusInput(), '0');
    fireEvent(radiusInput(), 'blur');

    expect(radiusInput().props.value).toBe('1');
    expect(screen.getByText(RADIUS_MESSAGE)).toBeTruthy();
  });

  it('an empty field becomes the default 15 on blur and shows the message', () => {
    renderScreen();

    fireEvent.changeText(radiusInput(), '');
    fireEvent(radiusInput(), 'blur');

    expect(radiusInput().props.value).toBe('15');
    expect(screen.getByText(RADIUS_MESSAGE)).toBeTruthy();
  });

  it('an in-range typed value stays and shows no message', () => {
    renderScreen();

    fireEvent.changeText(radiusInput(), '30');
    fireEvent(radiusInput(), 'blur');

    expect(radiusInput().props.value).toBe('30');
    expect(screen.queryByText(RADIUS_MESSAGE)).toBeNull();
  });

  it('the message clears once the user types again', () => {
    renderScreen();

    fireEvent.changeText(radiusInput(), '0');
    fireEvent(radiusInput(), 'blur');
    expect(screen.getByText(RADIUS_MESSAGE)).toBeTruthy();

    fireEvent.changeText(radiusInput(), '9');
    expect(screen.queryByText(RADIUS_MESSAGE)).toBeNull();
  });

  it('refuses to save an out-of-range radius typed without leaving the field', () => {
    renderScreen();

    fireEvent.changeText(radiusInput(), '60');
    fireEvent.press(screen.getByLabelText('Save changes'));

    expect(screen.getByText(RADIUS_MESSAGE)).toBeTruthy();
    expect(api.upsertProviderProfile).not.toHaveBeenCalled();
  });
});
