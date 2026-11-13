import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import SPClearanceScreen from '../SPClearanceScreen';
import { clearanceErrors, clearanceProblem } from '../../../../src/components/ClearanceUploadForm';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    myClearances: jest.fn(),
    createClearance: jest.fn(),
    removeClearance: jest.fn(),
    uploadImage: jest.fn(),
  },
}));
jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>picker</Text> };
});

const base = { hasPhoto: true, number: 'NBI-12345', issuedOn: '', expiresOn: '2028-12-31' };

describe('clearance form rules', () => {
  it('requires an expiry date and has no no-expiry option', () => {
    expect(clearanceProblem({ ...base, expiresOn: '' })).toBe('Pick the expiry date.');
    expect(clearanceErrors({ ...base, expiresOn: '' }).expiry).toBe('Pick the expiry date.');
    expect(clearanceProblem(base)).toBeNull();
    expect(clearanceErrors(base).expiry).toBeUndefined();
  });

  it('requires a clearance number of 2 to 60 characters', () => {
    expect(clearanceProblem({ ...base, number: ' A ' })).toMatch(/2–60/);
    expect(clearanceErrors({ ...base, number: '' }).number).toMatch(/2–60/);
    expect(clearanceProblem({ ...base, number: 'AB' })).toBeNull();
    expect(clearanceProblem({ ...base, number: 'A'.repeat(60) })).toBeNull();
    expect(clearanceErrors({ ...base, number: 'A'.repeat(61) }).number).toMatch(/60 characters or fewer/);
  });

  it('rejects an issue date after the expiry date', () => {
    expect(clearanceProblem({ ...base, issuedOn: '2028-12-31', expiresOn: '2028-12-31' })).toBeNull();
    expect(clearanceProblem({ ...base, issuedOn: '2029-01-01', expiresOn: '2028-12-31' }))
      .toBe('The issue date is after the expiry date');
    expect(clearanceErrors({ ...base, issuedOn: '2029-01-01', expiresOn: '2028-12-31' }).issued)
      .toBe('The issue date is after the expiry date');
    expect(clearanceProblem({ ...base, issuedOn: '' })).toBeNull();
  });
});

const row = (overrides: Record<string, unknown>) => ({
  id: 'k1',
  clearance_type: 'nbi',
  clearance_number: 'NBI-9',
  issued_on: null,
  expires_on: '2027-06-01',
  status: 'pending',
  rejection_reason: null,
  revoke_reason: null,
  reviewed_at: null,
  revoked_at: null,
  created_at: '2026-11-01T00:00:00Z',
  document_url: null,
  ...overrides,
});

describe('SPClearanceScreen', () => {
  beforeEach(() => {
    (api.myClearances as jest.Mock).mockResolvedValue({
      required: false,
      clearances: [
        row({ id: 'pending', status: 'pending' }),
        row({ id: 'rejected', status: 'rejected', clearance_type: 'police', rejection_reason: 'Blurry photo' }),
        row({ id: 'revoked', status: 'revoked', revoke_reason: 'Name does not match' }),
        row({ id: 'expired', status: 'expired', expires_on: '2020-01-01' }),
        row({ id: 'approved', status: 'approved' }),
      ],
    });
  });

  it('lists each clearance and only offers resubmit or remove where that is allowed', async () => {
    render(<SPClearanceScreen onBack={jest.fn()} />);
    expect(await screen.findByText('Upload a valid NBI clearance or police clearance. An admin checks that the name matches your ID.')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /no expiry/i })).toBeNull();

    const pending = within(screen.getByTestId('clearance-pending'));
    expect(pending.getByText('Under review')).toBeTruthy();
    expect(pending.getByText('NBI-9 · until 2027-06-01')).toBeTruthy();
    expect(pending.getByRole('button', { name: 'Remove NBI clearance' })).toBeTruthy();
    expect(pending.queryByRole('button', { name: 'Resubmit NBI clearance' })).toBeNull();

    const rejected = within(screen.getByTestId('clearance-rejected'));
    expect(rejected.getByText('Police clearance')).toBeTruthy();
    expect(rejected.getByText('Not accepted')).toBeTruthy();
    expect(rejected.getByText('Blurry photo')).toBeTruthy();
    expect(rejected.getByRole('button', { name: 'Resubmit Police clearance' })).toBeTruthy();
    expect(rejected.getByRole('button', { name: 'Remove Police clearance' })).toBeTruthy();

    const revoked = within(screen.getByTestId('clearance-revoked'));
    expect(revoked.getByText('Revoked')).toBeTruthy();
    expect(revoked.getByText('Name does not match')).toBeTruthy();
    expect(revoked.getByRole('button', { name: 'Resubmit NBI clearance' })).toBeTruthy();
    expect(revoked.queryByRole('button', { name: 'Remove NBI clearance' })).toBeNull();

    const expired = within(screen.getByTestId('clearance-expired'));
    expect(expired.getByText('Expired')).toBeTruthy();
    expect(expired.getByText('NBI-9 · until 2020-01-01')).toBeTruthy();
    expect(expired.getByRole('button', { name: 'Resubmit NBI clearance' })).toBeTruthy();
    expect(expired.queryByText(/Name does not match/)).toBeNull();
    expect(expired.queryByRole('button', { name: 'Remove NBI clearance' })).toBeNull();

    const approved = within(screen.getByTestId('clearance-approved'));
    expect(approved.getByText('Approved')).toBeTruthy();
    expect(approved.queryByRole('button', { name: 'Resubmit NBI clearance' })).toBeNull();
    expect(approved.queryByRole('button', { name: 'Remove NBI clearance' })).toBeNull();

    fireEvent.press(rejected.getByRole('button', { name: 'Resubmit Police clearance' }));
    expect(screen.getByLabelText('Clearance number').props.value).toBe('NBI-9');
    expect(screen.getByRole('radio', { name: 'Police' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Expiry date').props.accessibilityValue.text).toBe('Not set');
    expect(screen.getByLabelText('Issued on').props.accessibilityValue.text).toBe('Not set');
  });
});
