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
beforeEach(() => {
  jest.clearAllMocks();
  (api.jobDispute as jest.Mock).mockResolvedValue(base);
  (api.addDisputeEntry as jest.Mock).mockResolvedValue({});
  (api.respondToCancellation as jest.Mock).mockResolvedValue({});
});
function show() { render(<HODisputeStatusScreen jobId="job" onBack={jest.fn()} />); }

it('shows a zero-budget case without claiming that an admin has reviewed it', async () => {
  show();
  await screen.findByText('Complaint awaiting admin review');
  expect(screen.queryByText('Under Review')).toBeNull();
  expect(screen.queryByText('Our support team is looking into this.')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Case statement'), 'My account of the repair');
  await act(async () => { fireEvent.press(screen.getByText('Submit statement')); });
  await waitFor(() => expect(api.addDisputeEntry).toHaveBeenCalledWith('case', { kind: 'statement', body: 'My account of the repair', message_id: undefined }));
});
it('shows actual clarification activity, its author, timestamp, and photo evidence', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue({ ...base, entries: [{ id: 'entry', kind: 'clarification',
    body: 'Explain the missing checklist task', created_at: '2026-10-04T00:00:00Z',
    author: { id: 'admin', full_name: 'Admin Reviewer', role: 'admin' },
    message: { id: 'message', body: 'Repair photo', attachment_path: 'photo.jpg' }, attachment_url: 'https://storage.test/photo' }] });
  show();
  await screen.findByText('Admin Reviewer · clarification');
  expect(screen.getByText('Explain the missing checklist task')).toBeTruthy();
  expect(screen.getByLabelText('Case photo evidence').props.source.uri).toBe('https://storage.test/photo');
});
it('allows appeals on closed cases without offering payment reversal', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue({ ...base, status: 'resolved', resolution: 'reviewed', resolution_note: 'Decision documented' });
  show();
  await screen.findByText('Decision documented');
  fireEvent.changeText(screen.getByLabelText('Case statement'), 'Please reconsider this evidence');
  await act(async () => { fireEvent.press(screen.getByText('Submit appeal')); });
  await waitFor(() => expect(api.addDisputeEntry).toHaveBeenCalledWith('case', expect.objectContaining({ kind: 'appeal' })));
  expect(screen.queryByText('Agree to cancellation and refund')).toBeNull();
});
it('lets the assigned provider agree or contest before the response deadline', async () => {
  (api.jobDispute as jest.Mock).mockResolvedValue({ ...base, cancellation_state: 'pending', cancellation_deadline: new Date(Date.now() + 3600000).toISOString() });
  show();
  await screen.findByText('Agree to cancellation and refund');
  fireEvent.changeText(screen.getByLabelText('Case statement'), 'I contest the cancellation');
  await act(async () => { fireEvent.press(screen.getByText('Contest cancellation')); });
  await waitFor(() => expect(api.respondToCancellation).toHaveBeenCalledWith('case', false, 'I contest the cancellation', undefined));
});
it('attaches only the selected own job message as case evidence', async () => {
  (api.openConversation as jest.Mock).mockResolvedValue({ id: 'conversation' });
  (api.messages as jest.Mock).mockResolvedValue([
    { id: 'own', sender_id: 'provider', body: 'Own evidence', created_at: '2026-10-04T00:00:00Z' },
    { id: 'other', sender_id: 'client', body: 'Other person evidence', created_at: '2026-10-04T00:00:00Z' },
  ]);
  show();
  await screen.findByText('Choose job chat evidence');
  await act(async () => { fireEvent.press(screen.getByText('Choose job chat evidence')); });
  await act(async () => { fireEvent.press(await screen.findByText(/Own evidence/)); });
  expect(screen.queryByText(/Other person evidence/)).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Case statement'), 'Evidence description');
  await act(async () => { fireEvent.press(screen.getByText('Submit statement')); });
  await waitFor(() => expect(api.addDisputeEntry).toHaveBeenCalledWith('case', expect.objectContaining({ message_id: 'own' })));
});
it('shows save failures and preserves the draft for retry', async () => {
  (api.addDisputeEntry as jest.Mock).mockRejectedValue(new Error('Case is already closed'));
  show();
  await screen.findByText('Complaint awaiting admin review');
  fireEvent.changeText(screen.getByLabelText('Case statement'), 'Keep this draft');
  await act(async () => { fireEvent.press(screen.getByText('Submit statement')); });
  await screen.findByText('Case is already closed');
  expect(screen.getByLabelText('Case statement').props.value).toBe('Keep this draft');
});
