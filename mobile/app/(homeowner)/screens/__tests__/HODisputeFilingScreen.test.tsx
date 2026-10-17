import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import HODisputeFilingScreen from '../HODisputeFilingScreen';
import { api } from '../../../../src/lib/api';

let mockRole: 'homeowner' | 'provider' = 'homeowner';
jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'me' }, role: mockRole }),
}));
jest.mock('../../../../src/lib/api', () => ({ api: { getJob: jest.fn(), raiseDispute: jest.fn(), uploadImage: jest.fn() } }));
jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///leak.jpg' }] }),
}));

const job = {
  id: 'job-1',
  title: 'Plumbing: Fix leaking faucet',
  status: 'confirmed',
  budget: 250,
  assigned_provider: { full_name: 'TaskBuddyProvider' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'homeowner';
  (api.getJob as jest.Mock).mockResolvedValue(job);
  (api.raiseDispute as jest.Mock).mockResolvedValue({ id: 'case-1' });
});

function renderFiling() {
  const onBack = jest.fn();
  const onSubmitted = jest.fn();
  render(<HODisputeFilingScreen jobId="job-1" onBack={onBack} onSubmitted={onSubmitted} />);
  return { onBack, onSubmitted };
}

const sendButton = () => screen.getByRole('button', { name: 'Send report' });

/** Opens the "Send this report?" confirm and returns its dialog, the only alert on screen. */
async function openConfirm() {
  fireEvent.press(sendButton());
  return screen.findByRole('alert');
}

it('opens as Report a problem with the job named, no reason chosen, and Send report disabled', async () => {
  const { onBack } = renderFiling();

  expect(screen.getByText('Report a problem')).toBeTruthy();
  expect(await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider')).toBeTruthy();
  for (const label of ['Payment or cancellation issue', 'Work not completed', 'Work quality issue', 'Provider did not arrive', 'Conduct issue', 'Something else']) {
    expect(screen.getByRole('radio', { name: label, selected: false })).toBeTruthy();
  }
  expect(sendButton().props.accessibilityState?.disabled).toBe(true);
  expect(screen.getByText('Photos (optional)')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Back'));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(api.raiseDispute).not.toHaveBeenCalled();
});

it.each([
  ['Work not completed', 'Work not completed'],
  ['Something else', 'Other'],
  ['Provider did not arrive', 'Participant did not arrive'],
])('chooses "%s" and sends the reason value "%s" exactly once after the confirm', async (label, value) => {
  const { onSubmitted } = renderFiling();
  await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider');

  fireEvent.press(screen.getByRole('radio', { name: label }));
  expect(sendButton().props.accessibilityState?.disabled).toBe(false);
  const dialog = await openConfirm();
  expect(within(dialog).getByText('Send this report?')).toBeTruthy();
  fireEvent.press(within(dialog).getByRole('button', { name: 'Send report' }));

  await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
  expect(api.raiseDispute).toHaveBeenCalledTimes(1);
  expect(api.raiseDispute).toHaveBeenCalledWith('job-1', { reason: value, details: undefined });
});

it('Keep editing closes the confirm and sends nothing', async () => {
  renderFiling();
  await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider');
  fireEvent.press(screen.getByRole('radio', { name: 'Work quality issue' }));

  const dialog = await openConfirm();
  fireEvent.press(within(dialog).getByRole('button', { name: 'Keep editing' }));

  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(api.raiseDispute).not.toHaveBeenCalled();
});

it('counts the description against 1000 characters and sends it trimmed', async () => {
  renderFiling();
  await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider');
  fireEvent.press(screen.getByRole('radio', { name: 'Work quality issue' }));
  const details = screen.getByLabelText('Tell us what happened');

  expect(details.props.maxLength).toBe(1000);
  fireEvent.changeText(details, '  Tap leaks  ');
  expect(screen.getByText('Optional · 13 / 1000')).toBeTruthy();

  fireEvent.press(within(await openConfirm()).getByRole('button', { name: 'Send report' }));
  await waitFor(() => expect(api.raiseDispute).toHaveBeenCalledWith('job-1', { reason: 'Work quality issue', details: 'Tap leaks' }));
});

it('names the held payment in the confirm only while money is held', async () => {
  renderFiling();
  await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider');
  fireEvent.press(screen.getByRole('radio', { name: 'Conduct issue' }));

  const dialog = await openConfirm();
  expect(within(dialog).getByText(/The ₱250\.00 payment is paused until an admin decides\./)).toBeTruthy();
  expect(within(dialog).getByText(/TaskBuddyProvider is told and can add their side\./)).toBeTruthy();
});

it('leaves the payment line out when the job holds no money', async () => {
  (api.getJob as jest.Mock).mockResolvedValue({ ...job, status: 'open', budget: 0 });
  renderFiling();
  await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider');
  fireEvent.press(screen.getByRole('radio', { name: 'Conduct issue' }));

  const dialog = await openConfirm();
  expect(within(dialog).queryByText(/paused/)).toBeNull();
});

it('a provider files against the client, not against their own name', async () => {
  mockRole = 'provider';
  renderFiling();
  expect(await screen.findByText('Plumbing: Fix leaking faucet')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Client did not arrive' })).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: 'Client did not arrive' }));

  const dialog = await openConfirm();
  expect(within(dialog).getByText(/The client is told and can add their side\./)).toBeTruthy();
  fireEvent.press(within(dialog).getByRole('button', { name: 'Send report' }));
  await waitFor(() => expect(api.raiseDispute).toHaveBeenCalledWith('job-1', { reason: 'Participant did not arrive', details: undefined }));
});

it('a failed send shows the message and keeps the form for another try', async () => {
  (api.raiseDispute as jest.Mock).mockRejectedValue(new Error('A report is already open for this job.'));
  const { onSubmitted } = renderFiling();
  await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider');
  fireEvent.press(screen.getByRole('radio', { name: 'Work not completed' }));

  fireEvent.press(within(await openConfirm()).getByRole('button', { name: 'Send report' }));

  expect(await screen.findByText('A report is already open for this job.')).toBeTruthy();
  expect(onSubmitted).not.toHaveBeenCalled();
  expect(sendButton().props.accessibilityState?.disabled).toBe(false);
});

it('sends no details when they are only spaces, since the details are optional', async () => {
  renderFiling();
  await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider');
  fireEvent.press(screen.getByRole('radio', { name: 'Work quality issue' }));
  fireEvent.changeText(screen.getByLabelText('Tell us what happened'), '   \n\n  ');

  fireEvent.press(within(await openConfirm()).getByRole('button', { name: 'Send report' }));

  await waitFor(() => expect(api.raiseDispute).toHaveBeenCalledWith('job-1', { reason: 'Work quality issue', details: undefined }));
});

describe('HODisputeFilingScreen — the job failing to load', () => {
  it('a job that fails to load shows Try again, keeps Send report disabled, and Try again loads the job', async () => {
    (api.getJob as jest.Mock).mockRejectedValueOnce(new Error('Job unavailable')).mockResolvedValue(job);
    renderFiling();

    const card = await screen.findByTestId('error-card');
    expect(within(card).getByText("Couldn't load this job")).toBeTruthy();
    expect(screen.queryByText('Loading job…')).toBeNull();
    fireEvent.press(screen.getByRole('radio', { name: 'Work not completed' }));
    expect(sendButton().props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider')).toBeTruthy();
    expect(screen.queryByTestId('error-card')).toBeNull();
    expect(sendButton().props.accessibilityState?.disabled).toBe(false);
  });
});

it('uploads the chosen photos privately and sends them with the report', async () => {
  (api.uploadImage as jest.Mock).mockResolvedValue('client-1/leak.jpg');
  renderFiling();
  await screen.findByText('Plumbing: Fix leaking faucet · TaskBuddyProvider');
  fireEvent.press(screen.getByRole('radio', { name: 'Work quality issue' }));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Add photo' })));
  expect(screen.getByText('1 / 6')).toBeTruthy();

  fireEvent.press(within(await openConfirm()).getByRole('button', { name: 'Send report' }));

  await waitFor(() =>
    expect(api.raiseDispute).toHaveBeenCalledWith('job-1', {
      reason: 'Work quality issue',
      details: undefined,
      photo_paths: ['client-1/leak.jpg'],
    }),
  );
  expect(api.uploadImage).toHaveBeenCalledWith('dispute-evidence', 'file:///leak.jpg');
});
