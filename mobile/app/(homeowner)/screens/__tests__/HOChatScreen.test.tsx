import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOChatScreen from '../HOChatScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'me' } }) }));
jest.mock('../../../../src/lib/api', () => ({
  api: {
    openConversation: jest.fn(),
    messages: jest.fn(),
    streamMessages: jest.fn(),
    markConversationRead: jest.fn(),
    getJob: jest.fn(),
    sendMessage: jest.fn(),
    uploadImage: jest.fn(),
  },
  mergeMessageById: (list: { id: string }[], message: { id: string }) => {
    const index = list.findIndex((item) => item.id === message.id);
    return index === -1 ? [...list, message] : list.map((item) => (item.id === message.id ? message : item));
  },
}));

const conversation = {
  id: 'conversation-1', job_id: 'job-1', job_title: 'Plumbing: Fix toilet', job_status: 'confirmed',
  counterpart_name: 'TaskBuddyProvider', counterpart_avatar_url: null, last_message_at: null, created_at: '2026-10-06T09:00:00Z',
};
const job = { id: 'job-1', title: 'Plumbing: Fix toilet', status: 'confirmed', budget: 1, assigned_provider: { full_name: 'TaskBuddyProvider' } };
const messages = [
  { id: 'm1', conversation_id: 'conversation-1', sender_id: 'provider', body: 'Incoming message', attachment_path: null, attachment_url: null, read_at: null, created_at: '2026-10-11T08:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  (api.openConversation as jest.Mock).mockResolvedValue(conversation);
  (api.messages as jest.Mock).mockResolvedValue(messages);
  (api.streamMessages as jest.Mock).mockReturnValue(jest.fn());
  (api.markConversationRead as jest.Mock).mockResolvedValue({ success: true });
  (api.getJob as jest.Mock).mockResolvedValue(job);
});

function renderChat() {
  return render(<HOChatScreen jobId="job-1" onBack={jest.fn()} onViewJob={jest.fn()} />);
}

it('opens the same conversation, reads the job for the pinned line, and shows the job in the header', async () => {
  renderChat();

  expect(await screen.findByText('You hired TaskBuddyProvider · ₱1.00 held safely')).toBeTruthy();
  expect(screen.getByText('Plumbing: Fix toilet · Confirmed')).toBeTruthy();
  expect(api.openConversation).toHaveBeenCalledWith('job-1');
  expect(api.messages).toHaveBeenCalledWith('conversation-1');
  expect(api.markConversationRead).toHaveBeenCalledWith('conversation-1');
  expect(api.streamMessages).toHaveBeenCalledWith('conversation-1', '2026-10-11T08:00:00Z', expect.any(Function));
  expect(api.getJob).toHaveBeenCalledWith('job-1');
});

it('a job that cannot be read hides only the pinned line and keeps the chat', async () => {
  (api.getJob as jest.Mock).mockRejectedValue(new Error('offline'));
  renderChat();

  expect(await screen.findByText('Incoming message')).toBeTruthy();
  expect(screen.queryByText(/held safely/)).toBeNull();
});

it('sends the typed text with the same call and clears the box', async () => {
  (api.sendMessage as jest.Mock).mockResolvedValue({ id: 'm2', conversation_id: 'conversation-1', sender_id: 'me', body: 'On my way', attachment_path: null, attachment_url: null, read_at: null, created_at: '2026-10-11T09:00:00Z' });
  renderChat();
  await screen.findByText('Incoming message');

  fireEvent.changeText(screen.getByPlaceholderText('Message…'), 'On my way');
  fireEvent.press(screen.getByRole('button', { name: 'Send message' }));

  await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('conversation-1', 'On my way'));
  await waitFor(() => expect(screen.getByPlaceholderText('Message…').props.value).toBe(''));
});

it('sends a message with the blank lines inside it as typed, trimming only its ends', async () => {
  (api.sendMessage as jest.Mock).mockResolvedValue({ id: 'm3', conversation_id: 'conversation-1', sender_id: 'me', body: 'First\n\n\nSecond', attachment_path: null, attachment_url: null, read_at: null, created_at: '2026-10-11T09:00:00Z' });
  renderChat();
  await screen.findByText('Incoming message');

  fireEvent.changeText(screen.getByPlaceholderText('Message…'), '  First\n\n\nSecond  ');
  fireEvent.press(screen.getByRole('button', { name: 'Send message' }));

  await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('conversation-1', 'First\n\n\nSecond'));
});
