import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SPChatScreen from '../SPChatScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'provider' } }) }));
jest.mock('../../../../src/lib/api', () => ({
  api: {
    openConversation: jest.fn(),
    messages: jest.fn(),
    streamMessages: jest.fn(),
    markConversationRead: jest.fn(),
    getJob: jest.fn(),
  },
  mergeMessageById: (list: { id: string }[]) => list,
}));

const conversation = {
  id: 'conversation-2', job_id: 'job-2', job_title: 'Cleaning: Window cleaning', job_status: 'in_progress',
  counterpart_name: 'Ana Cruz', counterpart_avatar_url: null, last_message_at: null, created_at: '2026-10-06T09:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.openConversation as jest.Mock).mockResolvedValue(conversation);
  (api.messages as jest.Mock).mockResolvedValue([]);
  (api.streamMessages as jest.Mock).mockReturnValue(jest.fn());
  (api.markConversationRead as jest.Mock).mockResolvedValue({ success: true });
  (api.getJob as jest.Mock).mockResolvedValue({ id: 'job-2', title: 'Cleaning: Window cleaning', status: 'in_progress', budget: '1500.00' });
});

it('names the client who hired the provider, the job, and the held payment', async () => {
  render(<SPChatScreen jobId="job-2" onBack={jest.fn()} onViewJob={jest.fn()} />);

  expect(await screen.findByText('Ana Cruz hired you · ₱1,500.00 held safely')).toBeTruthy();
  expect(screen.getByText('Ana Cruz')).toBeTruthy();
  expect(screen.getByText('Cleaning: Window cleaning · In Progress')).toBeTruthy();
  expect(api.getJob).toHaveBeenCalledWith('job-2');
});

it('View job opens the job from the provider chat', async () => {
  const onViewJob = jest.fn();
  render(<SPChatScreen jobId="job-2" onBack={jest.fn()} onViewJob={onViewJob} />);
  await screen.findByText('Ana Cruz hired you · ₱1,500.00 held safely');

  fireEvent.press(screen.getByLabelText('View job'));

  expect(onViewJob).toHaveBeenCalledTimes(1);
});
