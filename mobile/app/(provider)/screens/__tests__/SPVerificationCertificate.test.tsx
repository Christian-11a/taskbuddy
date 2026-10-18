import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import SPVerificationScreen from '../SPVerificationScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { requestAppPermission } from '../../../../src/lib/permissions';
import { todayIso } from '../../../../src/components/CertificateNotices';

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
      myCredentials: jest.fn(),
      createCredential: jest.fn(),
      uploadImage: jest.fn(),
      startIdentitySession: jest.fn(),
      submitVerification: jest.fn(),
    },
  };
});
jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  CameraType: { front: 'front', back: 'back' },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>picker</Text> };
});

const PROVIDER_PROFILE = { category_id: 3, bio: 'Plumber, eight years', is_verified: false };
const ACCOUNT_PROFILE = { address: 'Arturo Tanco Drive, Lipa' };

const PLUMBING = (certificate: string) => ({ category_id: 3, name: 'Plumbing', primary: true, certificate });

function me(overrides: Record<string, unknown>) {
  return {
    id: 'v1', provider_id: 'p1', method: 'stripe_identity', submitted_at: '2026-10-07T07:38:00Z',
    reviewed_at: null, rejection_reason: null,
    identity: 'approved', certificate: 'none', verified: false, status: 'approved',
    services: [PLUMBING('none')],
    ...overrides,
  };
}

function daysFromNow(days: number): string {
  const day = new Date();
  day.setDate(day.getDate() + days);
  return todayIso(day);
}

const credential = (overrides: Record<string, unknown>) => ({
  id: 'c1', category_id: 3, credential_type: 'tesda_nc', title: 'Plumbing NC II', issuer: 'TESDA',
  issued_on: null, expires_on: null, status: 'approved', service_categories: { id: 3, name: 'Plumbing' },
  ...overrides,
});

function renderScreen(props: { startAt?: 'certificate'; categoryId?: number; onBack?: () => void } = {}) {
  return render(
    <SPVerificationScreen onBack={props.onBack ?? jest.fn()} onEditProfile={jest.fn()} startAt={props.startAt} categoryId={props.categoryId} />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (useAuth as jest.Mock).mockReturnValue({ profile: ACCOUNT_PROFILE, providerProfile: PROVIDER_PROFILE });
  (api.myVerification as jest.Mock).mockResolvedValue(null);
  (api.myCredentials as jest.Mock).mockResolvedValue([]);
  (api.uploadImage as jest.Mock).mockResolvedValue('p1/cert.jpg');
  (api.createCredential as jest.Mock).mockResolvedValue({ id: 'c9', category_id: 3, status: 'pending' });
  (requestAppPermission as jest.Mock).mockResolvedValue(true);
});

describe('status screen', () => {
  it('keeps the certificate upload action hidden after submission while the verification read is stale', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(
      me({ identity: 'pending', status: 'pending', services: [PLUMBING('none')] }),
    );
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cert' }] });
    renderScreen({ startAt: 'certificate' });

    await screen.findByText('Your Plumbing certificate');
    await act(async () => fireEvent.press(screen.getByLabelText('Add certificate photo')));
    fireEvent.changeText(screen.getByLabelText('Certificate name'), 'Plumbing NC II');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Upload certificate' })));

    await waitFor(() => expect(screen.getByText('Certificate: under review')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Upload your certificate' })).toBeNull();
    expect(api.myVerification).toHaveBeenCalledTimes(2);
  });

  it('says "You\'re verified" only when verified, with no missing-part rows', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(
      me({ verified: true, certificate: 'approved', services: [PLUMBING('approved')] }),
    );
    renderScreen();
    expect(await screen.findByText("You're verified!")).toBeTruthy();
    expect(screen.queryByTestId('verification-status-rows')).toBeNull();
  });

  it('ID approved, certificate none: two rows and an action that opens the certificate step', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(me({}));
    renderScreen();
    expect(await screen.findByText('ID approved · certificate needed')).toBeTruthy();
    expect(screen.queryByText("You're verified!")).toBeNull();
    expect(screen.getByText('Identity: approved')).toBeTruthy();
    expect(screen.getByText('Certificate: needed')).toBeTruthy();

    fireEvent.press(screen.getAllByRole('button', { name: 'Upload your certificate' })[0]);
    expect(await screen.findByText('Your Plumbing certificate')).toBeTruthy();
    expect(screen.getByText('Service: Plumbing')).toBeTruthy();
    expect(screen.getByText(/TESDA Plumbing NC II/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload certificate' })).toBeTruthy();
  });

  it('ID approved, certificate under review: shows the wait and no upload action', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(me({ certificate: 'pending', services: [PLUMBING('pending')] }));
    renderScreen();
    expect(await screen.findByText('Certificate: under review')).toBeTruthy();
    expect(screen.getByText('Identity: approved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upload your certificate' })).toBeNull();
  });

  it('ID approved, certificate expired: offers Upload renewal', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(me({ certificate: 'expired', services: [PLUMBING('expired')] }));
    renderScreen();
    expect(await screen.findByText('Certificate: expired')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Upload renewal' }).length).toBeGreaterThan(0);
  });

  it('ID approved, certificate rejected: says not accepted and offers a new upload', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(me({ certificate: 'rejected', services: [PLUMBING('rejected')] }));
    renderScreen();
    expect(await screen.findByText('Certificate: not accepted')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Upload a new certificate' }).length).toBeGreaterThan(0);
  });

  it('ID under review: keeps the review timeline, adds both rows and a certificate action', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(
      me({ identity: 'pending', status: 'pending', services: [PLUMBING('none')] }),
    );
    renderScreen();
    expect(await screen.findByText("We're checking your documents")).toBeTruthy();
    expect(screen.getByText('Identity: under review')).toBeTruthy();
    expect(screen.getByText('Certificate: needed')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Upload your certificate' }));
    expect(await screen.findByText('Your Plumbing certificate')).toBeTruthy();
  });

  it('old API shape: an approved status is still "verified" and no rows appear', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue({
      id: 'v1', provider_id: 'p1', status: 'approved', method: 'manual', submitted_at: '2026-10-07T07:38:00Z', reviewed_at: null, rejection_reason: null,
    });
    renderScreen();
    expect(await screen.findByText("You're verified!")).toBeTruthy();
    expect(screen.queryByTestId('verification-status-rows')).toBeNull();
    expect(api.myCredentials).not.toHaveBeenCalled();
  });
});

describe('expiry', () => {
  it('amber notice 10 days before: names the service, and Upload renewal opens the form', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(
      me({ verified: true, certificate: 'approved', services: [PLUMBING('approved')] }),
    );
    (api.myCredentials as jest.Mock).mockResolvedValue([credential({ expires_on: daysFromNow(10) })]);
    renderScreen();
    expect(await screen.findByText('Your Plumbing certificate expires in 10 days. Upload the renewed one.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Upload renewal' }));
    expect(await screen.findByText('Your Plumbing certificate')).toBeTruthy();
  });

  it('red notice once expired, naming what it blocks', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(
      me({ certificate: 'expired', services: [PLUMBING('expired')] }),
    );
    (api.myCredentials as jest.Mock).mockResolvedValue([credential({ expires_on: daysFromNow(-3) })]);
    renderScreen();
    expect(
      await screen.findByText('Your Plumbing certificate expired. Upload a new one to send proposals for Plumbing.'),
    ).toBeTruthy();
  });
});

describe('deep entry', () => {
  it('startAt certificate opens the upload for the given service and creates it for that service', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      profile: ACCOUNT_PROFILE,
      providerProfile: { ...PROVIDER_PROFILE, approved_secondary_services: [{ category_id: 7, service_categories: { name: 'Cleaning' } }] },
    });
    (api.myVerification as jest.Mock).mockResolvedValue(
      me({ certificate: 'approved', verified: true, services: [PLUMBING('approved'), { category_id: 7, name: 'Cleaning', primary: false, certificate: 'none' }] }),
    );
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cert' }] });
    renderScreen({ startAt: 'certificate', categoryId: 7 });

    expect(await screen.findByText('Your Cleaning certificate')).toBeTruthy();
    expect(screen.getByText(/TESDA Housekeeping NC II/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText('Add certificate photo')));
    fireEvent.changeText(screen.getByLabelText('Certificate name'), 'Housekeeping NC II');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Upload certificate' })));
    expect(api.createCredential).toHaveBeenCalledWith(expect.objectContaining({ category_id: 7, title: 'Housekeeping NC II' }));
  });

  it('shows the errors above the fields when the form is empty', async () => {
    (api.myVerification as jest.Mock).mockResolvedValue(me({}));
    renderScreen({ startAt: 'certificate' });
    await screen.findByText('Your Plumbing certificate');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Upload certificate' })));
    expect(screen.getByText('Add a clear photo of the certificate.')).toBeTruthy();
    expect(api.createCredential).not.toHaveBeenCalled();
  });
});

describe('the five-step flow', () => {
  async function toCertificateStep(verification: Record<string, unknown>) {
    (api.myVerification as jest.Mock).mockResolvedValue(verification);
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.jpg', fileSize: 1000 }] });
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
    expect(screen.getByText('STEP 1 OF 5 · YOUR ID')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('UMID, Photo of the front'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Take photo of the front' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Use this photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Take selfie' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
  }

  it('shows the certificate between the selfie and the review, and sending it moves to the review', async () => {
    await toCertificateStep(me({ identity: 'none', status: undefined, certificate: 'none', services: [PLUMBING('none')] }));
    expect(screen.getByText('STEP 4 OF 5 · CERTIFICATE')).toBeTruthy();
    expect(screen.getByText('Your Plumbing certificate')).toBeTruthy();

    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cert' }] });
    await act(async () => fireEvent.press(screen.getByLabelText('Add certificate photo')));
    fireEvent.changeText(screen.getByLabelText('Certificate name'), 'Plumbing NC II');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Upload certificate' })));

    await waitFor(() => expect(screen.getByText('STEP 5 OF 5 · REVIEW')).toBeTruthy());
    expect(api.createCredential).toHaveBeenCalledWith(expect.objectContaining({ category_id: 3 }));
    expect(screen.getByText('Certificate for Plumbing: sent for review')).toBeTruthy();
    // The review shows the certificate that was sent, with its picked photo and a way to replace it.
    expect(screen.getByText('Certificate · Plumbing')).toBeTruthy();
    expect(screen.getByLabelText('Certificate · Plumbing photo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace certificate' })).toBeTruthy();
  });

  it('Replace certificate goes back to the certificate step with the upload form', async () => {
    await toCertificateStep(me({ identity: 'none', status: undefined, certificate: 'none', services: [PLUMBING('none')] }));
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cert' }] });
    await act(async () => fireEvent.press(screen.getByLabelText('Add certificate photo')));
    fireEvent.changeText(screen.getByLabelText('Certificate name'), 'Plumbing NC II');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Upload certificate' })));
    await waitFor(() => expect(screen.getByText('STEP 5 OF 5 · REVIEW')).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: 'Replace certificate' }));
    expect(screen.getByText('STEP 4 OF 5 · CERTIFICATE')).toBeTruthy();
    expect(screen.getByLabelText('Add certificate photo')).toBeTruthy();
  });

  it('lets an already-pending certificate be skipped', async () => {
    await toCertificateStep(me({ identity: 'none', status: undefined, certificate: 'pending', services: [PLUMBING('pending')] }));
    expect(screen.getByText('Your certificate is under review')).toBeTruthy();
    expect(screen.queryByLabelText('Add certificate photo')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('STEP 5 OF 5 · REVIEW')).toBeTruthy();
    expect(api.createCredential).not.toHaveBeenCalled();
    // No photo from this session: the card names the certificate and its status, with nothing to replace.
    expect(screen.getByText('Certificate · Plumbing')).toBeTruthy();
    expect(screen.getByText('Sent for review')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Replace certificate' })).toBeNull();
  });

  it('an approved certificate shows on the review as Approved, without a photo or a Replace action', async () => {
    await toCertificateStep(me({ identity: 'none', status: undefined, certificate: 'approved', services: [PLUMBING('approved')] }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('STEP 5 OF 5 · REVIEW')).toBeTruthy();
    expect(screen.getByText('Certificate · Plumbing')).toBeTruthy();
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Replace certificate' })).toBeNull();
  });
});
