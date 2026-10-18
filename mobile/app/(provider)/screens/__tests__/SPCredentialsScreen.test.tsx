import React from 'react';
import { TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import SPCredentialsScreen, { credentialProblem, isValidExpiry } from '../SPCredentialsScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/lib/api', () => ({
  api: { myCredentials: jest.fn(), createCredential: jest.fn(), removeCredential: jest.fn(), uploadImage: jest.fn() },
}));
let mockProfile: unknown = { category_id: 1, service_categories: { name: 'Plumbing' }, approved_secondary_services: [] };
jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({ providerProfile: mockProfile }),
}));
jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange, testID }: { onChange: (e: { type: string }, d?: Date) => void; testID?: string }) => (
      <Text testID={testID} onPress={() => onChange({ type: 'set' }, new Date(2099, 11, 31))}>picker</Text>
    ),
  };
});

describe('credential rules', () => {
  it('accepts a blank or real YYYY-MM-DD expiry only', () => {
    expect(isValidExpiry('')).toBe(true);
    expect(isValidExpiry('2028-12-31')).toBe(true);
    expect(isValidExpiry('2028-02-30')).toBe(false);
    expect(isValidExpiry('12/31/2028')).toBe(false);
  });

  it('asks for the photo first, then the name and issuer', () => {
    const base = { hasPhoto: true, categoryId: 1, title: 'Plumbing NC II', issuer: 'TESDA', expiresOn: '' };
    expect(credentialProblem({ ...base, hasPhoto: false })).toMatch(/photo/);
    expect(credentialProblem({ ...base, title: ' ' })).toMatch(/certificate name/);
    expect(credentialProblem({ ...base, issuer: '' })).toMatch(/issued/);
    expect(credentialProblem(base)).toBeNull();
  });
});

it('lists credentials with their review status and submits a new one', async () => {
  (api.myCredentials as jest.Mock).mockResolvedValue([
    { id: 'c1', title: 'Plumbing NC II', issuer: 'TESDA', status: 'approved', expires_on: null, service_categories: { id: 1, name: 'Plumbing' } },
  ]);
  (api.uploadImage as jest.Mock).mockResolvedValue('p1/cert.jpg');
  (api.createCredential as jest.Mock).mockResolvedValue({ id: 'c2' });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cert' }] });
  render(<SPCredentialsScreen onBack={jest.fn()} />);

  expect(await screen.findByText('Certified')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByLabelText('Add certificate photo')));
  fireEvent.changeText(screen.getByLabelText('Certificate name'), 'Plumbing NC II');
  await act(async () => fireEvent.press(screen.getByText('Submit for review')));

  expect(api.uploadImage).toHaveBeenCalledWith('provider-credentials', 'file:///cert');
  expect(api.createCredential).toHaveBeenCalledWith(expect.objectContaining({
    category_id: 1, credential_type: 'tesda_nc', title: 'Plumbing NC II', issuer: 'TESDA', document_path: 'p1/cert.jpg',
  }));
});

describe('certification form UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.myCredentials as jest.Mock).mockResolvedValue([]);
    (api.uploadImage as jest.Mock).mockResolvedValue('p1/cert.jpg');
    (api.createCredential as jest.Mock).mockResolvedValue({ id: 'c9' });
  });

  it('shows an error under each empty field after Submit', async () => {
    render(<SPCredentialsScreen onBack={jest.fn()} />);
    await screen.findByText('No credentials yet.');
    await act(async () => fireEvent.press(screen.getByText('Submit for review')));
    expect(screen.getByText('Add a clear photo of the certificate.')).toBeTruthy();
    expect(screen.getByText('Enter the certificate name, e.g. Plumbing NC II.')).toBeTruthy();
    expect(api.createCredential).not.toHaveBeenCalled();
  });

  it('focuses the first field in error', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cert' }] });
    render(<SPCredentialsScreen onBack={jest.fn()} />);
    await screen.findByText('No credentials yet.');
    await act(async () => fireEvent.press(screen.getByLabelText('Add certificate photo')));
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    await act(async () => fireEvent.press(screen.getByText('Submit for review')));
    expect(focus).toHaveBeenCalled();
  });

  it('sends the picked expiry as YYYY-MM-DD and confirms with Sent for review', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cert' }] });
    render(<SPCredentialsScreen onBack={jest.fn()} />);
    await screen.findByText('No credentials yet.');
    await act(async () => fireEvent.press(screen.getByLabelText('Add certificate photo')));
    fireEvent.changeText(screen.getByLabelText('Certificate name'), 'Plumbing NC II');
    fireEvent.press(screen.getByLabelText('Expiry date'));
    fireEvent.press(screen.getByTestId('expiry-picker'));
    await act(async () => fireEvent.press(screen.getByText('Submit for review')));
    expect(api.createCredential).toHaveBeenCalledWith(expect.objectContaining({ expires_on: '2099-12-31' }));
    expect(screen.getByText('Sent for review')).toBeTruthy();
  });

  it('Resubmit on a rejected row pre-fills the form', async () => {
    (api.myCredentials as jest.Mock).mockResolvedValue([
      { id: 'c3', title: 'Old NC', issuer: 'TESDA', status: 'rejected', rejection_reason: 'Blurry', credential_type: 'trade_certificate', category_id: 1, credential_number: 'N-77', expires_on: null, service_categories: { id: 1, name: 'Plumbing' } },
    ]);
    render(<SPCredentialsScreen onBack={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText('Resubmit Old NC'));
    expect(screen.getByLabelText('Certificate name').props.value).toBe('Old NC');
    expect(screen.getByLabelText('Certificate number (optional)').props.value).toBe('N-77');
  });
});

describe('expiry notices', () => {
  const dayFromNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const approved = (expires_on: string | null, status = 'approved') => ({
    id: 'c1', title: 'Plumbing NC II', issuer: 'TESDA', status, expires_on, category_id: 1, credential_type: 'tesda_nc',
    service_categories: { id: 1, name: 'Plumbing' },
  });

  it('warns 10 days before and Upload renewal keeps the form on that service', async () => {
    (api.myCredentials as jest.Mock).mockResolvedValue([approved(dayFromNow(10))]);
    render(<SPCredentialsScreen onBack={jest.fn()} />);
    expect(await screen.findByText('Your Plumbing certificate expires in 10 days. Upload the renewed one.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Upload renewal' }));
    expect(screen.getByLabelText('Add certificate photo')).toBeTruthy();
  });

  it('says expired and what it blocks once past the date', async () => {
    (api.myCredentials as jest.Mock).mockResolvedValue([approved(dayFromNow(-2))]);
    render(<SPCredentialsScreen onBack={jest.fn()} />);
    expect(
      await screen.findByText('Your Plumbing certificate expired. Upload a new one to send proposals for Plumbing.'),
    ).toBeTruthy();
  });

  it('shows nothing when the certificate has more than 30 days left', async () => {
    (api.myCredentials as jest.Mock).mockResolvedValue([approved(dayFromNow(90))]);
    render(<SPCredentialsScreen onBack={jest.fn()} />);
    await screen.findByText('Certified');
    expect(screen.queryByTestId('expiry-notices')).toBeNull();
  });
});

describe('two services', () => {
  it('offers a chip per service, starts on the first without a valid certificate and shows its guidance', async () => {
    mockProfile = {
      category_id: 1, service_categories: { name: 'Plumbing' },
      approved_secondary_services: [{ category_id: 2, service_categories: { name: 'Cleaning' } }],
    };
    (api.myCredentials as jest.Mock).mockResolvedValue([
      { id: 'c1', title: 'Plumbing NC II', issuer: 'TESDA', status: 'approved', expires_on: null, category_id: 1, credential_type: 'tesda_nc', service_categories: { id: 1, name: 'Plumbing' } },
    ]);
    (api.uploadImage as jest.Mock).mockResolvedValue('p/c.jpg');
    (api.createCredential as jest.Mock).mockResolvedValue({ id: 'c2' });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cert' }] });
    render(<SPCredentialsScreen onBack={jest.fn()} />);

    await screen.findByText('Certified');
    expect(screen.getByLabelText('Plumbing')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Cleaning').props.accessibilityState.selected).toBe(true));
    expect(screen.getByText(/TESDA Housekeeping NC II/)).toBeTruthy();
    expect(screen.queryByText('Service: Plumbing')).toBeNull();

    fireEvent.press(screen.getByLabelText('Plumbing'));
    expect(screen.getByText(/TESDA Plumbing NC II\./)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByLabelText('Add certificate photo')));
    fireEvent.changeText(screen.getByLabelText('Certificate name'), 'Plumbing NC II');
    await act(async () => fireEvent.press(screen.getByText('Submit for review')));
    expect(api.createCredential).toHaveBeenCalledWith(expect.objectContaining({ category_id: 1 }));
    mockProfile = { category_id: 1, service_categories: { name: 'Plumbing' }, approved_secondary_services: [] };
  });
});
