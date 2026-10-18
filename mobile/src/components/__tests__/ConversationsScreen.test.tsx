import React from 'react';
import { ScrollView } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ConversationsScreen from '../ConversationsScreen';
import { api } from '../../lib/api';
import { clearAsyncDataCache } from '../../hooks/useAsyncData';

jest.mock('../../lib/api', () => ({
  api: { conversations: jest.fn(), myJobs: jest.fn(), assignedJobs: jest.fn() },
}));
let mockRole = 'homeowner';
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ role: mockRole }) }));

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  mockRole = 'homeowner';
  (api.myJobs as jest.Mock).mockResolvedValue([]);
  (api.assignedJobs as jest.Mock).mockResolvedValue([]);
});

const conv = (id: string, over: Record<string, unknown> = {}) => ({
  id, job_id: `job-${id}`, job_title: `Job ${id}`, job_status: 'confirmed', counterpart_name: `Person ${id}`,
  counterpart_avatar_url: null, last_message_at: `2026-10-${10 + Number(id)}T00:00:00Z`, created_at: '2026-10-01T00:00:00Z', ...over,
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

it('marks a conversation with unread messages and shows the count', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([
    {
      id: 'c9', job_id: 'job-9', job_title: 'Fix sink', job_status: 'in_progress',
      counterpart_name: 'Ana', counterpart_avatar_url: null,
      last_message_at: '2026-10-17T00:00:00Z', created_at: '2026-10-16T00:00:00Z', unread_count: 3,
    },
  ]);
  render(<ConversationsScreen onOpenChat={jest.fn()} />);

  expect(await screen.findByTestId('conversation-unread-c9')).toBeTruthy();
  expect(screen.getByLabelText('Chat with Ana about Fix sink, 3 unread')).toBeTruthy();
});

const mixed = () => [
  conv('1', { unread_count: 2 }),
  conv('2', { job_status: 'completed' }),
  conv('3', { job_status: 'cancelled' }),
  conv('4', { job_status: 'in_progress' }),
];

it('defaults to Active, and the chips switch to Unread, Finished and All with sections', async () => {
  (api.conversations as jest.Mock).mockResolvedValue(mixed());
  render(<ConversationsScreen onOpenChat={jest.fn()} />);

  expect(await screen.findByText('Person 1')).toBeTruthy();
  expect(screen.getByText('Person 4')).toBeTruthy();
  expect(screen.queryByText('Person 2')).toBeNull();
  expect(screen.getByLabelText('Unread, 1')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Unread, 1'));
  expect(screen.getByText('Person 1')).toBeTruthy();
  expect(screen.queryByText('Person 4')).toBeNull();

  fireEvent.press(screen.getByLabelText('Finished'));
  expect(screen.getByText('Person 2')).toBeTruthy();
  expect(screen.getByText('Person 3')).toBeTruthy();
  expect(screen.queryByText('Person 1')).toBeNull();

  fireEvent.press(screen.getByLabelText('All'));
  expect(screen.getByText('Active jobs')).toBeTruthy();
  expect(screen.getAllByText('Finished')).toHaveLength(2); // chip + section title
  expect(screen.getByText('Person 3')).toBeTruthy();
});

it('shows the status pill with My Jobs wording', async () => {
  (api.conversations as jest.Mock).mockResolvedValue(mixed());
  render(<ConversationsScreen onOpenChat={jest.fn()} />);
  await screen.findByText('Person 1');
  expect(screen.getByTestId('conversation-status-1')).toHaveTextContent('Confirmed');
  expect(screen.getByTestId('conversation-status-4')).toHaveTextContent('In Progress');
});

it('shows service chips with counts and filters by service', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([conv('1'), conv('2'), conv('3')]);
  (api.myJobs as jest.Mock).mockResolvedValue([
    { id: 'job-1', service_categories: { name: 'Plumbing' } },
    { id: 'job-2', service_categories: { name: 'Plumbing' } },
    { id: 'job-3', service_categories: { name: 'Cleaning' } },
  ]);
  render(<ConversationsScreen onOpenChat={jest.fn()} />);

  expect(await screen.findByLabelText('Plumbing, 2')).toBeTruthy();
  expect(await screen.findByText('Plumbing · Job 1')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Cleaning, 1'));
  expect(screen.getByText('Person 3')).toBeTruthy();
  expect(screen.queryByText('Person 1')).toBeNull();
});

it('hides service chips when only one service, or when the job lookup fails', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([conv('1'), conv('2')]);
  (api.myJobs as jest.Mock).mockRejectedValue(new Error('offline'));
  render(<ConversationsScreen onOpenChat={jest.fn()} />);
  await screen.findByText('Person 1');
  expect(screen.queryByTestId('messages-services')).toBeNull();
});

it('shows a search box only above 8 chats and searches title or name', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([conv('1'), conv('2')]);
  const { unmount } = render(<ConversationsScreen onOpenChat={jest.fn()} />);
  await screen.findByText('Person 1');
  expect(screen.queryByTestId('messages-search')).toBeNull();
  unmount();
  clearAsyncDataCache();

  const many = Array.from({ length: 9 }, (_, i) => conv(String(i + 1)));
  (api.conversations as jest.Mock).mockResolvedValue(many);
  render(<ConversationsScreen onOpenChat={jest.fn()} />);
  await screen.findByText('Person 1');
  fireEvent.changeText(screen.getByTestId('messages-search'), 'person 7');
  expect(screen.getByText('Person 7')).toBeTruthy();
  expect(screen.queryByText('Person 1')).toBeNull();
  fireEvent.changeText(screen.getByTestId('messages-search'), 'zzz');
  expect(screen.getByText('No matching chats')).toBeTruthy();
});

it('has an empty state per filter, worded for the client', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([conv('2', { job_status: 'completed' })]);
  render(<ConversationsScreen onOpenChat={jest.fn()} />);
  expect(await screen.findByText('No active chats')).toBeTruthy();
  expect(screen.getByText('Chats start when you hire a provider.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Unread, 0'));
  expect(screen.getByText('No unread chats')).toBeTruthy();
});

it('shows the cached list at once on a second mount, without the skeleton', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([conv('1')]);
  const first = render(<ConversationsScreen onOpenChat={jest.fn()} />);
  await screen.findByText('Person 1');
  first.unmount();

  (api.conversations as jest.Mock).mockReturnValue(new Promise(() => {}));
  render(<ConversationsScreen onOpenChat={jest.fn()} />);
  expect(screen.getByText('Person 1')).toBeTruthy();
  expect(screen.getByTestId('refresh-bar')).toBeTruthy();
});

it('pull to refresh reloads both lists and stops the spinner when the reload fails', async () => {
  (api.conversations as jest.Mock).mockResolvedValue([conv('1')]);
  render(<ConversationsScreen onOpenChat={jest.fn()} />);
  await screen.findByText('Person 1');
  const listScroll = () => screen.UNSAFE_getAllByType(ScrollView).find((n) => n.props.refreshControl);

  (api.conversations as jest.Mock).mockRejectedValue(new Error('offline'));
  act(() => { listScroll()!.props.refreshControl.props.onRefresh(); });
  expect(listScroll()!.props.refreshControl.props.refreshing).toBe(true);
  await waitFor(() => expect(listScroll()!.props.refreshControl.props.refreshing).toBe(false));
  expect(api.conversations).toHaveBeenCalledTimes(2);
  expect(api.myJobs).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Person 1')).toBeTruthy();
});

it('works for providers: uses assigned jobs and provider wording', async () => {
  mockRole = 'provider';
  (api.conversations as jest.Mock).mockResolvedValue([conv('2', { job_status: 'completed' })]);
  (api.assignedJobs as jest.Mock).mockResolvedValue([{ id: 'job-2', service_categories: { name: 'Plumbing' } }]);
  render(<ConversationsScreen onOpenChat={jest.fn()} />);
  expect(await screen.findByText('Chats start when a client hires you.')).toBeTruthy();
  expect(api.assignedJobs).toHaveBeenCalled();
  expect(api.myJobs).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Finished'));
  expect(await screen.findByText('Plumbing · Job 2')).toBeTruthy();
});
