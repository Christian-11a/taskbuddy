import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPVerificationScreen from '../SPVerificationScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => {
  class MockApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError: MockApiError,
    api: {
      myVerification: jest.fn(),
      uploadImage: jest.fn(),
      startIdentitySession: jest.fn(),
      submitVerification: jest.fn(),
    },
  };
});

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../../src/lib/permissions', () => ({
  requestAppPermission: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  CameraType: { front: 'front', back: 'back' },
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

const PROVIDER_PROFILE = { category_id: 3, bio: 'Plumber, eight years', is_verified: false };

const PENDING = {
  id: 'v1',
  provider_id: 'p1',
  status: 'pending',
  method: 'manual',
  submitted_at: '2026-10-07T07:38:00Z',
  reviewed_at: null,
  rejection_reason: null,
};

function renderScreen(props: { onBack?: () => void; onVerified?: () => Promise<void> } = {}) {
  return render(
    <SPVerificationScreen onBack={props.onBack ?? jest.fn()} onVerified={props.onVerified} />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (useAuth as jest.Mock).mockReturnValue({ providerProfile: PROVIDER_PROFILE });
  (api.myVerification as jest.Mock).mockResolvedValue(null);
});

describe('SPVerificationScreen — before you start', () => {
  it('says what the provider will do and what is already on their profile', async () => {
    renderScreen();

    expect(await screen.findByText('Get verified to start getting jobs')).toBeTruthy();
    expect(
      screen.getByText('Clients only see and hire verified providers. It takes about 3 minutes.'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Step 1, Choose your ID. PhilSys, driver's licence, UMID, passport or postal ID"),
    ).toBeTruthy();
    expect(screen.getByLabelText('Step 4, Review and send. Then a short secure check with Stripe')).toBeTruthy();
    expect(screen.getByLabelText('Service picked: done')).toBeTruthy();
    expect(screen.getByLabelText('Bio added: done')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled();
  });

  it('will not start while the service profile is missing, and says why', async () => {
    (useAuth as jest.Mock).mockReturnValue({ providerProfile: null });
    renderScreen();

    expect(await screen.findByText('Finish your profile first')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(screen.getByLabelText('Service picked: not done yet')).toBeTruthy();
  });

  it('explains how the ID photos are protected in a sheet', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('How we protect your ID'));

    expect(screen.getByText(/private storage bucket that only TaskBuddy admins can open/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Got it'));
    await waitFor(() => expect(screen.queryByText(/private storage bucket/)).toBeNull());
  });

  it('moves into the wizard on Start, and the header arrow goes back to the intro first', async () => {
    const onBack = jest.fn();
    renderScreen({ onBack });

    fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
    expect(screen.getByText('STEP 1 OF 4 · YOUR ID')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Back to the start'));
    expect(await screen.findByText('Get verified to start getting jobs')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Leave verification'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('never offers Start while a review is pending', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(PENDING);
    renderScreen();

    expect(await screen.findByText('Pending verification')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });
});
