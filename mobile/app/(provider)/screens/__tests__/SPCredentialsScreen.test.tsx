import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import SPCredentialsScreen, { credentialProblem, isValidExpiry } from '../SPCredentialsScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/lib/api', () => ({
  api: { myCredentials: jest.fn(), createCredential: jest.fn(), removeCredential: jest.fn(), uploadImage: jest.fn() },
}));
jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({ providerProfile: { category_id: 1, service_categories: { name: 'Plumbing' }, approved_secondary_services: [] } }),
}));
jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

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
