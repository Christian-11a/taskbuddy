import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import SPVerificationScreen from '../SPVerificationScreen';
import { api, ApiError } from '../../../../src/lib/api';
import * as WebBrowser from 'expo-web-browser';
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

    expect(await screen.findByText("We're checking your documents")).toBeTruthy();
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

const CONSENT = 'This is my own valid ID, and I agree to TaskBuddy using these photos to verify me.';
const CONTINUE_LABEL = 'Continue to secure check';

async function toReview() {
    (ImagePicker.launchCameraAsync as jest.Mock)
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///id.jpg' }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///selfie.jpg' }] });
    await startWizard();
    fireEvent.press(screen.getByLabelText('PhilSys National ID, Photo of the front'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));
    await screen.findByText('Is everything readable?');
    fireEvent.press(screen.getByRole('button', { name: 'Use this photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Take selfie' }));
    await screen.findByRole('button', { name: 'Continue' });
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Ready to send');
}

describe('SPVerificationScreen — review and send', () => {
  it('shows both photos with their own Retake, and explains Stripe before anything opens', async () => {
    await toReview();

    expect(screen.getByLabelText('Front photo')).toBeTruthy();
    expect(screen.getByLabelText('Selfie photo')).toBeTruthy();
    expect(screen.getByLabelText('Retake ID photo')).toBeTruthy();
    expect(screen.getByLabelText('Retake selfie')).toBeTruthy();
    expect(
      screen.getByText(/Next, Stripe opens a secure page and asks you to scan your ID and face once more/),
    ).toBeTruthy();
    expect(screen.getByText(/Only TaskBuddy admins can see the photos you took here/)).toBeTruthy();
    expect(
      screen.getByText(/If Stripe isn't available, your photos go to a TaskBuddy admin for manual review/),
    ).toBeTruthy();
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('keeps Continue to secure check off until the consent is ticked', async () => {
    await toReview();

    expect(screen.getByRole('button', { name: CONTINUE_LABEL })).toBeDisabled();
    fireEvent.press(screen.getByRole('checkbox', { name: CONSENT }));
    expect(screen.getByRole('button', { name: CONTINUE_LABEL })).not.toBeDisabled();
  });

  it('starts the same uploads and identity session as before, with the chosen ID type', async () => {
    (api.uploadImage as jest.Mock)
      .mockResolvedValueOnce('verification-docs/id.jpg')
      .mockResolvedValueOnce('verification-docs/selfie.jpg');
    (api.startIdentitySession as jest.Mock).mockResolvedValueOnce({ url: 'https://stripe.test/session' });
    (WebBrowser.openBrowserAsync as jest.Mock).mockResolvedValueOnce({ type: 'cancel' });
    await toReview();

    fireEvent.press(screen.getByRole('checkbox', { name: CONSENT }));
    fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));

    await waitFor(() => expect(api.startIdentitySession).toHaveBeenCalledTimes(1));
    expect(api.uploadImage).toHaveBeenNthCalledWith(1, 'verification-docs', 'file:///id.jpg');
    expect(api.uploadImage).toHaveBeenNthCalledWith(2, 'verification-docs', 'file:///selfie.jpg');
    expect(api.startIdentitySession).toHaveBeenCalledWith({
      id_document_path: 'verification-docs/id.jpg',
      selfie_path: 'verification-docs/selfie.jpg',
      document_type: 'philsys',
    });
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://stripe.test/session');
    expect(api.submitVerification).not.toHaveBeenCalled();
  });

  it('falls back to a manual review when Stripe answers with a server error, as before', async () => {
    (api.uploadImage as jest.Mock)
      .mockResolvedValueOnce('verification-docs/id.jpg')
      .mockResolvedValueOnce('verification-docs/selfie.jpg');
    (api.startIdentitySession as jest.Mock).mockRejectedValueOnce(
      new ApiError('Stripe Identity is not configured', 503),
    );
    (api.submitVerification as jest.Mock).mockResolvedValueOnce({ id: 'v1', status: 'pending' });
    await toReview();

    fireEvent.press(screen.getByRole('checkbox', { name: CONSENT }));
    fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));

    await waitFor(() =>
      expect(api.submitVerification).toHaveBeenCalledWith({
        id_document_path: 'verification-docs/id.jpg',
        selfie_path: 'verification-docs/selfie.jpg',
        document_type: 'philsys',
      }),
    );
  });

  it('shows a client error such as a rate limit as it is, with no manual submission', async () => {
    (api.uploadImage as jest.Mock)
      .mockResolvedValueOnce('verification-docs/id.jpg')
      .mockResolvedValueOnce('verification-docs/selfie.jpg');
    (api.startIdentitySession as jest.Mock).mockRejectedValueOnce(
      new ApiError('Too many attempts. Try later.', 429),
    );
    await toReview();

    fireEvent.press(screen.getByRole('checkbox', { name: CONSENT }));
    fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));

    expect(await screen.findByText('Too many attempts. Try later.')).toBeTruthy();
    expect(api.submitVerification).not.toHaveBeenCalled();
  });

  it('sends each Retake back to its own photo step', async () => {
    await toReview();

    fireEvent.press(screen.getByLabelText('Retake selfie'));
    expect(screen.getByText('Now a quick selfie')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Ready to send');

    fireEvent.press(screen.getByLabelText('Retake ID photo'));
    expect(screen.getByText('Get a clear photo of your PhilSys National ID')).toBeTruthy();
  });
});

describe('SPVerificationScreen — sending', () => {
  const NEVER = () => new Promise<never>(() => {});

  it('shows each step as it really happens, starting with the uploads', async () => {
    (api.uploadImage as jest.Mock).mockReturnValueOnce(NEVER()).mockReturnValueOnce(NEVER());
    await toReview();

    fireEvent.press(screen.getByRole('checkbox', { name: CONSENT }));
    fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));

    expect(await screen.findByText('Sending your documents…')).toBeTruthy();
    expect(screen.getByText('Please keep the app open. This takes a few seconds.')).toBeTruthy();
    expect(screen.getByLabelText('Uploading ID photo: in progress')).toBeTruthy();
    expect(screen.getByLabelText('Uploading selfie: in progress')).toBeTruthy();
    expect(screen.getByLabelText('Starting the secure check: waiting')).toBeTruthy();
    expect(screen.queryByText('Ready to send')).toBeNull();
  });

  it('moves to the secure check once both photos are up', async () => {
    (api.uploadImage as jest.Mock)
      .mockResolvedValueOnce('verification-docs/id.jpg')
      .mockResolvedValueOnce('verification-docs/selfie.jpg');
    (api.startIdentitySession as jest.Mock).mockReturnValueOnce(NEVER());
    await toReview();

    fireEvent.press(screen.getByRole('checkbox', { name: CONSENT }));
    fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));

    expect(await screen.findByLabelText('ID photo uploaded: done')).toBeTruthy();
    expect(screen.getByLabelText('Selfie uploaded: done')).toBeTruthy();
    expect(screen.getByLabelText('Starting the secure check: in progress')).toBeTruthy();
  });

  it('returns to the review with the error when an upload fails', async () => {
    (api.uploadImage as jest.Mock).mockRejectedValueOnce(new Error('Could not upload the image. Try again.'));
    await toReview();

    fireEvent.press(screen.getByRole('checkbox', { name: CONSENT }));
    fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));

    expect(await screen.findByText('Could not upload the image. Try again.')).toBeTruthy();
    expect(screen.getByText('Ready to send')).toBeTruthy();
    expect(screen.getByRole('button', { name: CONTINUE_LABEL })).not.toBeDisabled();
  });

  it('after a submission, shows the status the reload brings rather than the old one', async () => {
    const REJECTED = { ...PENDING, status: 'rejected', rejection_reason: 'The ID text is blurry.' };
    (api.myVerification as jest.Mock).mockResolvedValueOnce(REJECTED).mockResolvedValueOnce(PENDING);
    (api.uploadImage as jest.Mock)
      .mockResolvedValueOnce('verification-docs/id.jpg')
      .mockResolvedValueOnce('verification-docs/selfie.jpg');
    (api.startIdentitySession as jest.Mock).mockResolvedValueOnce({ url: null });
    (ImagePicker.launchCameraAsync as jest.Mock)
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///id.jpg' }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///selfie.jpg' }] });
    renderScreen();

    // A rejected provider starts again with Try again, not Start.
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    fireEvent.press(screen.getByLabelText('PhilSys National ID, Photo of the front'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));
    await screen.findByText('Is everything readable?');
    fireEvent.press(screen.getByRole('button', { name: 'Use this photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Take selfie' }));
    await screen.findByRole('button', { name: 'Continue' });
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Ready to send');
    fireEvent.press(screen.getByRole('checkbox', { name: CONSENT }));
    fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));

    expect(await screen.findByText("We're checking your documents")).toBeTruthy();
    expect(screen.queryByText('Ready to send')).toBeNull();
    expect(screen.queryByText('Your documents were rejected.')).toBeNull();
  });
});

describe('SPVerificationScreen — the status after a review', () => {
  it('pending: says what is happening, never that jobs are open, and goes back to the feed', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(PENDING);
    const onBack = jest.fn();
    renderScreen({ onBack });

    expect(await screen.findByText("We're checking your documents")).toBeTruthy();
    expect(screen.getByText("An admin is reviewing them. We'll notify you as soon as there's a decision.")).toBeTruthy();
    expect(screen.getByLabelText('Admin review, now. An admin is reviewing your documents now.')).toBeTruthy();
    expect(screen.queryByText(/jobs? (are )?open/i)).toBeNull();

    // The header arrow is the one way back: the pending view has no bar of its own.
    expect(screen.queryByRole('button', { name: 'Back to Feed' })).toBeNull();
    fireEvent.press(screen.getByLabelText('Leave verification'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('pending from the automated check: shows the check as running, not finished', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue({ ...PENDING, method: 'stripe_identity' });
    renderScreen();

    expect(
      await screen.findByLabelText('Automated check, now. Running. This usually takes a couple of minutes.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/Automated check, done/)).toBeNull();
  });

  it('pending: Check again asks for the status again', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(PENDING);
    renderScreen();
    await screen.findByText("We're checking your documents");

    fireEvent.press(screen.getByText('Check again'));

    await waitFor(() => expect(api.myVerification).toHaveBeenCalledTimes(2));
  });

  it('rejected: quotes the admin reason, lists how to fix it, and Try again opens the ID choice', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue({
      ...PENDING,
      status: 'rejected',
      rejection_reason: 'The ID text is blurry.',
    });
    renderScreen();

    expect(await screen.findByText('Your documents were rejected.')).toBeTruthy();
    expect(screen.getByText('Admin note: The ID text is blurry.')).toBeTruthy();
    expect(screen.getByText('How to fix it')).toBeTruthy();
    expect(screen.getByText('Retake the ID photo in good, even light')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Which ID will you use?')).toBeTruthy();
    expect(screen.getByText('STEP 1 OF 4 · YOUR ID')).toBeTruthy();
  });

  it('rejected without a reason: uses the plain wording and invents no reason', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue({ ...PENDING, status: 'rejected', rejection_reason: null });
    renderScreen();

    expect(await screen.findByText('Your documents were rejected.')).toBeTruthy();
    expect(screen.queryByText(/Admin note/)).toBeNull();
  });

  it('approved: says clients can see the provider, and See jobs near you goes to the feed', async () => {
    const onVerified = jest.fn().mockResolvedValue(undefined);
    (api.myVerification as jest.Mock).mockResolvedValue({
      ...PENDING,
      status: 'approved',
      reviewed_at: '2026-10-09T10:00:00Z',
    });
    renderScreen({ onVerified });

    expect(await screen.findByText("You're verified!")).toBeTruthy();
    expect(
      screen.getByText('Clients can now see you, and jobs near you are open. Your profile shows the Verified badge.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'See jobs near you' }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });
});

describe('SPVerificationScreen — a status that cannot be checked', () => {
  it('says the check failed, offers no start, and Try again checks the status again', async () => {
    (api.myVerification as jest.Mock).mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(PENDING);
    renderScreen();

    const card = await screen.findByTestId('error-card');
    expect(within(card).getByText("Couldn't check your verification")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.queryByText('Get verified')).toBeTruthy();

    fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText("We're checking your documents")).toBeTruthy();
    expect(screen.queryByTestId('error-card')).toBeNull();
    expect(api.myVerification).toHaveBeenCalledTimes(2);
  });
});
