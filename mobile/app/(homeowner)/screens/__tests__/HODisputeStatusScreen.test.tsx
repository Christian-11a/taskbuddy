import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HODisputeStatusScreen from '../HODisputeStatusScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'provider' } }) }));
jest.mock('../../../../src/lib/api', () => ({ api: {
  jobDispute: jest.fn(), addDisputeEntry: jest.fn(), respondToCancellation: jest.fn(), openConversation: jest.fn(), messages: jest.fn(),
} }));
const base = { id: 'case', job_id: 'job', reason: 'Repair quality', details: null, status: 'open',
  resolution: null, resolution_note: null, resolved_at: null, created_at: '2026-10-04T00:00:00Z',
  jobs: { client_id: 'client', assigned_provider_id: 'provider' }, escrow_transactions: null, entries: [] };
const pendingCase = { ...base, escrow_transactions: { status: 'disputed', amount: 800 }, cancellation_state: 'pending',
  cancellation_deadline: new Date(Date.now() + 3600000).toISOString() };
const SHEET_FIELD = 'What else should the admin know?';
beforeEach(() => {
  jest.clearAllMocks();
  (api.jobDispute as jest.Mock).mockResolvedValue(base);
  (api.addDisputeEntry as jest.Mock).mockResolvedValue({});
  (api.respondToCancellation as jest.Mock).mockResolvedValue({});
  (api.openConversation as jest.Mock).mockResolvedValue({ id: 'conversation' });
  (api.messages as jest.Mock).mockResolvedValue([]);
});
function show(props: { onMessage?: () => void } = {}) { render(<HODisputeStatusScreen jobId="job" onBack={jest.fn()} {...props} />); }
/** Opens the one sheet for adding details (open case) and waits for it. */
async function openDetailsSheet() {
  fireEvent.press(await screen.findByText('Add details or photos'));
  await screen.findByText('Add to your case');
}

it('shows a zero-budget case without claiming that an admin has reviewed it', async () => {
  show();
  await screen.findByText('An admin is reviewing this report');
  expect(screen.queryByText('Under Review')).toBeNull();
  expect(screen.queryByText('Our support team is looking into this.')).toBeNull();
  await openDetailsSheet();
  fireEvent.changeText(screen.getByLabelText(SHEET_FIELD), 'My account of the repair');
  await act(async () => { fireEvent.press(screen.getByText('Send details')); });
  await waitFor(() => expect(api.addDisputeEntry).toHaveBeenCalledWith('case', { kind: 'statement', body: 'My account of the repair', message_id: undefined }));
});
it('shows actual clarification activity, its author, timestamp, and photo evidence', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue({ ...base, entries: [{ id: 'entry', kind: 'clarification',
    body: 'Explain the missing checklist task', created_at: '2026-10-04T00:00:00Z',
    author: { id: 'admin', full_name: 'Admin Reviewer', role: 'admin' },
    message: { id: 'message', body: 'Repair photo', attachment_path: 'photo.jpg' }, attachment_url: 'https://storage.test/photo' }] });
  show();
  await screen.findByText(/Admin Reviewer/);
  expect(screen.queryByText(/clarification/)).toBeNull();
  expect(screen.getByText('Explain the missing checklist task')).toBeTruthy();
  expect(screen.getByLabelText('Case photo evidence').props.source.uri).toBe('https://storage.test/photo');
});
it('allows appeals on closed cases without offering payment reversal', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue({ ...base, status: 'resolved', resolution: 'reviewed', resolution_note: 'Decision documented' });
  show();
  await screen.findByText('Decision documented');
  await act(async () => { fireEvent.press(screen.getByText('Disagree? Appeal this decision')); });
  await screen.findByText('Appeal this decision');
  fireEvent.changeText(screen.getByLabelText(SHEET_FIELD), 'Please reconsider this evidence');
  await act(async () => { fireEvent.press(screen.getByText('Send appeal')); });
  await waitFor(() => expect(api.addDisputeEntry).toHaveBeenCalledWith('case', expect.objectContaining({ kind: 'appeal' })));
  expect(screen.queryByText('Agree to cancel')).toBeNull();
});
it('lets the assigned provider agree or contest before the response deadline', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue(pendingCase);
  show();
  await screen.findByText('Agree to cancel');
  fireEvent.changeText(screen.getByLabelText('Your note'), 'I contest the cancellation');
  fireEvent.press(screen.getByLabelText('Contest and explain'));
  await act(async () => { fireEvent.press(await screen.findByLabelText('Contest')); });
  await waitFor(() => expect(api.respondToCancellation).toHaveBeenCalledWith('case', false, 'I contest the cancellation', undefined));
  expect(api.respondToCancellation).toHaveBeenCalledTimes(1);
});
it('asks before agreeing, and sends the answer only once the refund is confirmed', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue(pendingCase);
  show();
  await screen.findByText('Agree to cancel');
  fireEvent.changeText(screen.getByLabelText('Your note'), 'Agreed, sorry for the trouble');
  fireEvent.press(screen.getByText('Agree to cancel'));
  expect(await screen.findByText('Agree to cancel?')).toBeTruthy();
  expect(screen.getByText(/₱800.00 goes back to the client's wallet/)).toBeTruthy();
  expect(api.respondToCancellation).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Go back'));
  await waitFor(() => expect(screen.queryByText('Agree to cancel?')).toBeNull());
  expect(api.respondToCancellation).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Agree to cancel'));
  await act(async () => { fireEvent.press(await screen.findByLabelText('Agree and refund ₱800.00')); });
  await waitFor(() => expect(api.respondToCancellation).toHaveBeenCalledWith('case', true, 'Agreed, sorry for the trouble', undefined));
  expect(api.respondToCancellation).toHaveBeenCalledTimes(1);
});
it('does not open a confirm from "Go back" on the contest sheet', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue(pendingCase);
  show();
  await screen.findByText('Agree to cancel');
  fireEvent.changeText(screen.getByLabelText('Your note'), 'The work was finished');
  fireEvent.press(screen.getByLabelText('Contest and explain'));
  expect(await screen.findByText('Contest this cancellation?')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Go back'));
  await waitFor(() => expect(screen.queryByText('Contest this cancellation?')).toBeNull());
  expect(api.respondToCancellation).not.toHaveBeenCalled();
});
it('keeps both answers disabled until the required note has text', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue(pendingCase);
  show();
  await screen.findByText('Agree to cancel');
  expect(screen.getByText('No reason given')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Agree to cancel', disabled: true })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Contest and explain', disabled: true })).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Contest and explain'));
  fireEvent.press(screen.getByLabelText('Agree to cancel'));
  expect(screen.queryByText('Agree to cancel?')).toBeNull();
  expect(screen.queryByText('Contest this cancellation?')).toBeNull();
  expect(api.respondToCancellation).not.toHaveBeenCalled();
});
it('attaches only the selected own job message as case evidence', async () => {
  (api.messages as jest.Mock).mockResolvedValue([
    { id: 'own', sender_id: 'provider', body: 'Own evidence', created_at: '2026-10-04T00:00:00Z' },
    { id: 'other', sender_id: 'client', body: 'Other person evidence', created_at: '2026-10-04T00:00:00Z' },
  ]);
  show();
  await openDetailsSheet();
  fireEvent.press(await screen.findByText(/Own evidence/));
  expect(screen.queryByText(/Other person evidence/)).toBeNull();
  fireEvent.changeText(screen.getByLabelText(SHEET_FIELD), 'Evidence description');
  await act(async () => { fireEvent.press(screen.getByText('Send details')); });
  await waitFor(() => expect(api.addDisputeEntry).toHaveBeenCalledWith('case', expect.objectContaining({ message_id: 'own' })));
});
it('shows save failures and preserves the draft for retry', async () => {
  (api.addDisputeEntry as jest.Mock).mockRejectedValue(new Error('Case is already closed'));
  show();
  await screen.findByText('An admin is reviewing this report');
  await openDetailsSheet();
  fireEvent.changeText(screen.getByLabelText(SHEET_FIELD), 'Keep this draft');
  await act(async () => { fireEvent.press(screen.getByText('Send details')); });
  await screen.findByText('Case is already closed');
  expect(screen.getByLabelText(SHEET_FIELD).props.value).toBe('Keep this draft');
});
it('shows the decision in plain words with a timeline, never a raw code', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue({ ...base, status: 'resolved', resolution: 'refunded_to_client',
    resolution_note: 'Refund approved after review', resolved_at: '2026-10-07T04:33:00Z', escrow_transactions: { status: 'refunded', amount: 800 } });
  show();
  await screen.findByText('₱800.00 refunded to the client');
  expect(screen.getByText('What happened')).toBeTruthy();
  expect(screen.getByText('Case closed · ₱800.00 refunded to the client')).toBeTruthy();
  expect(screen.queryByText(/refunded_to_client/)).toBeNull();
});
it('offers photos from my job chat as thumbnails, and sends the chosen one as evidence', async () => {
  (api.messages as jest.Mock).mockResolvedValue([
    { id: 'photo', sender_id: 'provider', body: '', attachment_path: 'chat.jpg', attachment_url: 'https://storage.test/chat.jpg', created_at: '2026-10-04T00:00:00Z' },
    { id: 'theirs', sender_id: 'client', body: '', attachment_path: 'x.jpg', attachment_url: 'https://storage.test/x.jpg', created_at: '2026-10-04T00:00:00Z' },
  ]);
  show();
  await openDetailsSheet();
  expect(await screen.findByLabelText('Photo from the job chat')).toBeTruthy();
  expect(screen.getAllByLabelText('Photo from the job chat')).toHaveLength(1);
  expect(screen.getByLabelText('Photo from the job chat').props.source.uri).toBe('https://storage.test/chat.jpg');
  await act(async () => { fireEvent.press(screen.getByLabelText('Photo message')); });
  fireEvent.changeText(screen.getByLabelText(SHEET_FIELD), 'Photo of the leak');
  await act(async () => { fireEvent.press(screen.getByText('Send details')); });
  await waitFor(() => expect(api.addDisputeEntry).toHaveBeenCalledWith('case', expect.objectContaining({ message_id: 'photo' })));
});
it('keeps Send disabled until the sheet has text', async () => {
  show();
  await openDetailsSheet();
  expect(screen.getByRole('button', { name: 'Send details', disabled: true })).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('Send details')); });
  expect(api.addDisputeEntry).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText(SHEET_FIELD), 'Some details');
  expect(screen.queryByRole('button', { name: 'Send details', disabled: true })).toBeNull();
});
it('lets an open case send an appeal from the sheet, labelled Send appeal', async () => {
  show();
  await openDetailsSheet();
  await act(async () => { fireEvent.press(screen.getByRole('radio', { name: 'Appeal' })); });
  fireEvent.changeText(screen.getByLabelText(SHEET_FIELD), 'Please look again');
  await act(async () => { fireEvent.press(screen.getByText('Send appeal')); });
  await waitFor(() => expect(api.addDisputeEntry).toHaveBeenCalledWith('case', expect.objectContaining({ kind: 'appeal', body: 'Please look again' })));
});
it('Cancel closes the sheet and sends nothing', async () => {
  show();
  await openDetailsSheet();
  fireEvent.changeText(screen.getByLabelText(SHEET_FIELD), 'Not sending this');
  await act(async () => { fireEvent.press(screen.getByLabelText('Cancel')); });
  await waitFor(() => expect(screen.queryByText('Add to your case')).toBeNull());
  expect(api.addDisputeEntry).not.toHaveBeenCalled();
});
it('shows a Message link to the other party when the screen is given a chat handler', async () => {
  const onMessage = jest.fn();
  show({ onMessage });
  fireEvent.press(await screen.findByText('Message the client'));
  expect(onMessage).toHaveBeenCalledTimes(1);
});
it('hides the Message link when no chat handler is given', async () => {
  show();
  await screen.findByText('Add details or photos');
  expect(screen.queryByText('Message the client')).toBeNull();
});
it('refreshes the case by pulling down, with no Refresh button', async () => {
  show();
  await screen.findByText('An admin is reviewing this report');
  expect(screen.queryByLabelText('Refresh complaint')).toBeNull();
  expect(screen.queryByText('Refresh')).toBeNull();
  const pullToRefresh = screen.getByTestId('case-scroll').props.refreshControl;
  act(() => { pullToRefresh.props.onRefresh(); });
  await waitFor(() => expect(api.jobDispute).toHaveBeenCalledTimes(2));
});
