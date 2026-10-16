import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ConversationsScreen from '../ConversationsScreen';
import { api } from '../../lib/api';
import { clearAsyncDataCache } from '../../hooks/useAsyncData';

jest.mock('../../lib/api', () => ({
  api: { conversations: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
});

it('lists each conversation, and tapping one opens that job chat', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([
    {
      id: 'conv-1',
      job_id: 'job-1',
      job_title: 'Fix sink',
      job_status: 'confirmed',
      counterpart_name: 'Ana Reyes',
      counterpart_avatar_url: null,
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ]);
  const onOpenChat = jest.fn();
  render(<ConversationsScreen onOpenChat={onOpenChat} />);

  expect(await screen.findByText('Ana Reyes')).toBeTruthy();
  expect(screen.getByText('Fix sink')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Chat with Ana Reyes about Fix sink' }));
  expect(onOpenChat).toHaveBeenCalledWith('job-1');
  expect(screen.queryByTestId('messages-empty')).toBeNull();
});

it('says there are no conversations yet when the list is empty', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([]);
  render(<ConversationsScreen onOpenChat={jest.fn()} />);

  expect(await screen.findByTestId('messages-empty')).toBeTruthy();
  expect(screen.getByText('No conversations yet')).toBeTruthy();
});
