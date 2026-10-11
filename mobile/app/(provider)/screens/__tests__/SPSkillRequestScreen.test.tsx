import React from 'react';
import { BrushCleaning, Wrench } from 'lucide-react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import SPSkillRequestScreen, {
  REASON_MAX,
  REASON_MIN,
  canSendRequest,
  reasonProblem,
  requestCopy,
  requestIconKind,
} from '../SPSkillRequestScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { showToast } from '../../../../src/components/Toast';
import { expectSavedCopyIgnored } from '../../../../src/testing/savedCopy';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    categories: jest.fn(),
    mySkillRequests: jest.fn(),
    createSkillRequest: jest.fn(),
    cancelSkillRequest: jest.fn(),
  },
}));
jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../../src/context/NotificationsContext', () => ({
  useNotifications: () => ({ notifications: [] }),
}));
jest.mock('../../../../src/components/Toast', () => ({ showToast: jest.fn() }));

const CATEGORIES = [
  { id: 1, name: 'Plumbing' },
  { id: 2, name: 'Cleaning' },
  { id: 3, name: 'Handyman' },
  { id: 4, name: 'Manicure' },
];

/** A provider with Plumbing as the main service and Cleaning as an approved extra. */
const profile = (overrides: Record<string, unknown> = {}) => ({
  profile_id: 'p1',
  category_id: 1,
  is_verified: true,
  service_categories: { name: 'Plumbing' },
  approved_secondary_services: [{ category_id: 2, service_categories: { id: 2, name: 'Cleaning' } }],
  ...overrides,
});

const request = (
  id: string,
  status: 'pending' | 'approved' | 'rejected' | 'cancelled',
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: 'change_primary',
  category_id: 3,
  reason: 'Ten years of plumbing work',
  status,
  review_note: null,
  created_at: '2026-10-01T09:00:00Z',
  reviewed_at: status === 'pending' ? null : '2026-10-03T09:00:00Z',
  category: { id: 3, name: 'Handyman' },
  ...extra,
});

const signedIn = (providerProfile = profile()) => ({
  providerProfile,
  refreshProfile: jest.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue(signedIn());
  (api.categories as jest.Mock).mockResolvedValue(CATEGORIES);
  (api.mySkillRequests as jest.Mock).mockResolvedValue([]);
  (api.createSkillRequest as jest.Mock).mockResolvedValue({ id: 'r9' });
  (api.cancelSkillRequest as jest.Mock).mockResolvedValue({ id: 'r1' });
});

describe('service request rules', () => {
  it('maps each request status to one icon', () => {
    expect(requestIconKind('approved')).toBe('check');
    expect(requestIconKind('pending')).toBe('clock');
    expect(requestIconKind('rejected')).toBe('cross');
    expect(requestIconKind('cancelled')).toBe('slash');
  });

  it('asks for the chosen service by name, with a fallback before one is chosen', () => {
    expect(requestCopy('Handyman')).toBe(
      'Tell us about your experience with Handyman. Admins check this before approving. Clients only see approved services.',
    );
    expect(requestCopy(null)).toBe(
      'Tell us about your experience with this service. Admins check this before approving. Clients only see approved services.',
    );
  });

  it('sends only a new service with a reason of at least the minimum length', () => {
    const offered = new Set([1, 2]);
    expect(REASON_MIN).toBe(10);
    expect(REASON_MAX).toBe(500);
    expect(canSendRequest({ categoryId: 3, offeredIds: offered, reason: 'a'.repeat(REASON_MIN), submitting: false })).toBe(true);
    expect(canSendRequest({ categoryId: 3, offeredIds: offered, reason: 'a'.repeat(REASON_MIN - 1), submitting: false })).toBe(false);
    expect(canSendRequest({ categoryId: 1, offeredIds: offered, reason: 'a'.repeat(20), submitting: false })).toBe(false);
    expect(canSendRequest({ categoryId: null, offeredIds: offered, reason: 'a'.repeat(20), submitting: false })).toBe(false);
    expect(canSendRequest({ categoryId: 3, offeredIds: offered, reason: 'a'.repeat(20), submitting: true })).toBe(false);
  });

  it('does not count spaces as a reason, and stops at the 500 maximum', () => {
    const offered = new Set([1, 2]);
    expect(canSendRequest({ categoryId: 3, offeredIds: offered, reason: ' '.repeat(40), submitting: false })).toBe(false);
    expect(canSendRequest({ categoryId: 3, offeredIds: offered, reason: 'a'.repeat(REASON_MAX), submitting: false })).toBe(true);
    expect(canSendRequest({ categoryId: 3, offeredIds: offered, reason: 'a'.repeat(REASON_MAX + 1), submitting: false })).toBe(false);
  });
});

describe('reasonProblem: the message under the reason box', () => {
  it('asks for at least 10 characters, in the wording the screen has always used', () => {
    expect(reasonProblem('')).toBe('Tell the admins a little more (at least 10 characters).');
    expect(reasonProblem(' '.repeat(12))).toBe('Tell the admins a little more (at least 10 characters).');
    expect(reasonProblem('a'.repeat(REASON_MIN - 1))).toBe('Tell the admins a little more (at least 10 characters).');
    expect(reasonProblem('a'.repeat(REASON_MIN))).toBeUndefined();
  });

  it('refuses more than 500 characters and says how to fix it', () => {
    expect(reasonProblem('a'.repeat(REASON_MAX))).toBeUndefined();
    expect(reasonProblem('a'.repeat(REASON_MAX + 1))).toBe('Keep it to 500 characters or fewer.');
  });
});

it('shows what clients see now: the main service, approved extras and verification', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  expect(await screen.findByText('What clients see now')).toBeTruthy();
  expect(screen.getByText('Plumbing')).toBeTruthy();
  expect(screen.getByText('Main service')).toBeTruthy();
  expect(screen.getByText('Cleaning')).toBeTruthy();
  expect(screen.getByText('Approved additional service')).toBeTruthy();
  expect(screen.getByText('ID verified')).toBeTruthy();
});

it('gives each service in What clients see now its own icon: the wrench for plumbing, not for cleaning', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await screen.findByText('What clients see now');
  expect(screen.UNSAFE_getAllByType(Wrench)).toHaveLength(1);
  expect(screen.UNSAFE_getAllByType(BrushCleaning)).toHaveLength(1);
});

it('hides the verified mark when the provider is not verified', async () => {
  (useAuth as jest.Mock).mockReturnValue(signedIn(profile({ is_verified: false })));
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await screen.findByText('What clients see now');
  expect(screen.queryByText('ID verified')).toBeNull();
});

it('offers only services the provider does not already have', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  expect(await screen.findByRole('radio', { name: 'Handyman' })).toBeTruthy();
  expect(screen.queryByRole('radio', { name: 'Plumbing' })).toBeNull();
  expect(screen.queryByRole('radio', { name: 'Cleaning' })).toBeNull();
  expect(screen.getByRole('radio', { name: 'Manicure' })).toBeTruthy();
});

it('keeps Send disabled until a service is chosen and the reason is long enough', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await screen.findByRole('radio', { name: 'Handyman' });
  expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('Why are you qualified?'), 'a'.repeat(REASON_MIN - 1));
  fireEvent.press(screen.getByRole('radio', { name: 'Handyman' }));
  expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('Why are you qualified?'), 'a'.repeat(REASON_MIN));
  expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
});

it('names the chosen service in the request copy and sends the same request fields', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await screen.findByRole('radio', { name: 'Handyman' });
  expect(screen.getByText(requestCopy(null))).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: 'Handyman' }));
  expect(screen.getByText(requestCopy('Handyman'))).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Why are you qualified?'), 'Ten years of plumbing work');
  expect(screen.getByText('26 / 500')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send request' })));
  expect(api.createSkillRequest).toHaveBeenCalledWith({
    type: 'change_primary',
    category_id: 3,
    reason: 'Ten years of plumbing work',
  });
  expect(showToast).toHaveBeenCalledWith('Request sent to the admins', 'success');
});

it('shows the reason message once the box is left, not while typing', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await screen.findByRole('radio', { name: 'Handyman' });
  const reason = screen.getByLabelText('Why are you qualified?');
  fireEvent.changeText(reason, 'Ten years');
  expect(screen.queryByText('Tell the admins a little more (at least 10 characters).')).toBeNull();

  fireEvent(reason, 'blur');

  expect(screen.getByText('Tell the admins a little more (at least 10 characters).')).toBeTruthy();
});

it('sends the reason trimmed, with the blank lines inside it kept as typed', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await screen.findByRole('radio', { name: 'Handyman' });
  fireEvent.press(screen.getByRole('radio', { name: 'Handyman' }));
  fireEvent.changeText(
    screen.getByLabelText('Why are you qualified?'),
    '  Ten years of plumbing work.\n\n\n\nLicensed.  ',
  );
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send request' })));
  expect(api.createSkillRequest).toHaveBeenLastCalledWith({
    type: 'change_primary',
    category_id: 3,
    reason: 'Ten years of plumbing work.\n\n\n\nLicensed.',
  });
});

it('shows the right icon for each past request: check, cross and slash, never a clock for approved', async () => {
  (api.mySkillRequests as jest.Mock).mockResolvedValue([
    request('r1', 'approved'),
    request('r2', 'rejected'),
    request('r3', 'cancelled'),
  ]);
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  expect(await screen.findByText('Past requests')).toBeTruthy();
  expect(screen.getByTestId('request-icon-check')).toBeTruthy();
  expect(screen.getByTestId('request-icon-cross')).toBeTruthy();
  expect(screen.getByTestId('request-icon-slash')).toBeTruthy();
  expect(screen.queryByTestId('request-icon-clock')).toBeNull();
  expect(screen.getByText('Approved')).toBeTruthy();
  expect(screen.getByText('Not approved')).toBeTruthy();
  expect(screen.getByText('Cancelled')).toBeTruthy();
});

it('an empty past-requests list says so inside the card', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  expect(await screen.findByText('Past requests')).toBeTruthy();
  expect(within(screen.getByTestId('empty-card')).getByText('No past requests')).toBeTruthy();
});

it('a failed request list says so, and Try again loads it again without an empty past-requests card', async () => {
  (api.mySkillRequests as jest.Mock).mockRejectedValueOnce(new Error('Requests unavailable'));
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  expect(await screen.findByText('Requests unavailable')).toBeTruthy();
  expect(screen.queryByText('No past requests')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No past requests')).toBeTruthy();
});

it('a failed services load says so above the form, with Try again', async () => {
  (api.categories as jest.Mock).mockRejectedValueOnce(new Error('Services unavailable')).mockResolvedValue(CATEGORIES);
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  expect(await screen.findByText('Services unavailable')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(api.categories).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Services unavailable')).toBeNull());
});

it('shows a pending request as under review, hides the form, and can cancel it', async () => {
  (api.mySkillRequests as jest.Mock).mockResolvedValue([request('r1', 'pending')]);
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  expect(await screen.findByText('Under review')).toBeTruthy();
  expect(screen.getByText('Change main service to Handyman')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send request' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel request' }));
  expect(await screen.findByText('Cancel this request?')).toBeTruthy();
  const cancelButtons = screen.getAllByRole('button', { name: 'Cancel request' });
  await act(async () => fireEvent.press(cancelButtons[cancelButtons.length - 1]));
  expect(api.cancelSkillRequest).toHaveBeenCalledWith('r1');
});

it('a saved service list of the wrong shape is ignored, and the screen loads as it does with nothing saved', async () => {
  (api.categories as jest.Mock).mockReturnValue(new Promise(() => {}));

  await expectSavedCopyIgnored('categories', {}, () => render(<SPSkillRequestScreen onBack={jest.fn()} />));
});
