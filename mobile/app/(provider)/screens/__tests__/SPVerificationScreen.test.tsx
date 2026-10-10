import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPVerificationScreen from '../SPVerificationScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import * as ImagePicker from 'expo-image-picker';
import { requestAppPermission } from '../../../../src/lib/permissions';

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
  (requestAppPermission as jest.Mock).mockResolvedValue(true);
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

async function startWizard() {
  renderScreen();
  fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
}

describe('SPVerificationScreen — choose your ID', () => {
  it('lists the five IDs with the side to photograph, and the original-ID rule', async () => {
    await startWizard();

    expect(screen.getByText('Which ID will you use?')).toBeTruthy();
    expect(screen.getByLabelText('PhilSys National ID, Photo of the front')).toBeTruthy();
    expect(screen.getByLabelText("Driver's licence, Photo of the front")).toBeTruthy();
    expect(screen.getByLabelText('UMID, Photo of the front')).toBeTruthy();
    expect(screen.getByLabelText('Passport, Photo page')).toBeTruthy();
    expect(screen.getByLabelText('Postal ID, Photo of the front')).toBeTruthy();
    expect(
      screen.getByText("Use your original, valid ID. Photocopies, screenshots and expired IDs can't be accepted."),
    ).toBeTruthy();
  });

  it('keeps Continue disabled until one ID is chosen', async () => {
    await startWizard();

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.press(screen.getByLabelText('UMID, Photo of the front'));
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('moves on to the ID photo step, and the header goes back to the ID choice', async () => {
    await startWizard();
    fireEvent.press(screen.getByLabelText('UMID, Photo of the front'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('STEP 2 OF 4 · ID PHOTO')).toBeTruthy();
    expect(screen.getByText('Get a clear photo of your UMID')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Back to the previous step'));
    expect(screen.getByText('Which ID will you use?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });
});

describe('SPVerificationScreen — photo tips and check', () => {
  async function toPhotoTips() {
    await startWizard();
    fireEvent.press(screen.getByLabelText('PhilSys National ID, Photo of the front'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  }

  it('shows the tips for the chosen ID, with good and bad examples, before any camera opens', async () => {
    await toPhotoTips();

    expect(screen.getByText('STEP 2 OF 4 · ID PHOTO')).toBeTruthy();
    expect(screen.getByText('Get a clear photo of your PhilSys National ID')).toBeTruthy();
    expect(screen.getByLabelText('Good example: clear, all 4 corners visible')).toBeTruthy();
    expect(screen.getByText('Keep all 4 corners inside the frame')).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('takes the ID photo with the back camera, then shows it to check', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///id.jpg', fileSize: 1000 }],
    });
    await toPhotoTips();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));

    expect(await screen.findByText('Is everything readable?')).toBeTruthy();
    expect(requestAppPermission).toHaveBeenCalledWith('camera');
    const options = (ImagePicker.launchCameraAsync as jest.Mock).mock.calls[0][0];
    expect(options.cameraType).toBeUndefined();
    expect(screen.getByText('Name and photo are sharp')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use this photo' })).toBeTruthy();
  });

  it('stays on the tips when the camera is cancelled', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] });
    await toPhotoTips();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));

    await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Get a clear photo of your PhilSys National ID')).toBeTruthy();
  });

  it('refuses a photo over 5 MB and keeps the tips', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///big.jpg', fileSize: 6 * 1024 * 1024 }],
    });
    await toPhotoTips();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));

    expect(await screen.findByText('Photo is too large. Please retake under 5 MB.')).toBeTruthy();
    expect(screen.getByText('Get a clear photo of your PhilSys National ID')).toBeTruthy();
  });

  it('takes the ID from the gallery as the alternative', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///gallery.jpg' }],
    });
    await toPhotoTips();

    fireEvent.press(screen.getByRole('button', { name: 'Upload from gallery' }));

    expect(await screen.findByText('Is everything readable?')).toBeTruthy();
    expect(requestAppPermission).toHaveBeenCalledWith('gallery');
  });

  it('moves on to the selfie with Use this photo, and Retake returns to the tips', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///id.jpg' }],
    });
    await toPhotoTips();
    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));
    await screen.findByText('Is everything readable?');

    fireEvent.press(screen.getByRole('button', { name: 'Retake' }));
    expect(screen.getByText('Get a clear photo of your PhilSys National ID')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));
    await screen.findByText('Is everything readable?');
    fireEvent.press(screen.getByRole('button', { name: 'Use this photo' }));

    expect(screen.getByText('STEP 3 OF 4 · SELFIE')).toBeTruthy();
  });
});

describe('SPVerificationScreen — selfie tips and retake', () => {
  async function toSelfieTips() {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///id.jpg' }],
    });
    await startWizard();
    fireEvent.press(screen.getByLabelText('PhilSys National ID, Photo of the front'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));
    await screen.findByText('Is everything readable?');
    fireEvent.press(screen.getByRole('button', { name: 'Use this photo' }));
  }

  it('shows the selfie tips and asks for a live photo only, with no gallery', async () => {
    await toSelfieTips();

    expect(screen.getByText('STEP 3 OF 4 · SELFIE')).toBeTruthy();
    expect(screen.getByText('Now a quick selfie')).toBeTruthy();
    expect(screen.getByText('We match your face with the photo on your ID.')).toBeTruthy();
    expect(screen.getByText('Take off glasses, hat and face mask')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take selfie' })).toBeTruthy();
    expect(screen.queryByText('Choose from gallery')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload from gallery' })).toBeNull();
  });

  it('takes the selfie with the front camera, then offers Retake and Continue', async () => {
    await toSelfieTips();
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///selfie.jpg' }],
    });

    fireEvent.press(screen.getByRole('button', { name: 'Take selfie' }));

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retake' })).toBeTruthy();
    expect(requestAppPermission).toHaveBeenLastCalledWith('camera');
    const calls = (ImagePicker.launchCameraAsync as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][0].cameraType).toBe('front');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('refuses a selfie over 5 MB and keeps the Take selfie button', async () => {
    await toSelfieTips();
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///big.jpg', fileSize: 6 * 1024 * 1024 }],
    });

    fireEvent.press(screen.getByRole('button', { name: 'Take selfie' }));

    expect(await screen.findByText('Photo is too large. Please retake under 5 MB.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take selfie' })).toBeTruthy();
  });

  it('goes on to the review with Continue, and Back from the selfie returns to the ID photo check', async () => {
    await toSelfieTips();
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///selfie.jpg' }],
    });
    fireEvent.press(screen.getByRole('button', { name: 'Take selfie' }));
    await screen.findByRole('button', { name: 'Continue' });

    fireEvent.press(screen.getByLabelText('Back to the previous step'));
    expect(screen.getByText('Is everything readable?')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Use this photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('STEP 4 OF 4 · REVIEW')).toBeTruthy();
  });
});
