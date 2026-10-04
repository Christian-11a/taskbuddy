import React from 'react';
import { ScrollView } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import MyJobs from '../HOMyJobs';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { clearRetainedState } from '../../../../src/hooks/useRetainedState';
jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'client' } }),
}));
jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn(), categories: jest.fn() },
}));
const rows = [
  { id: '1', category_id: 1, status: 'open', title: 'Open plumbing job' },
  {
    id: '2',
    category_id: 2,
    status: 'confirmed',
    title: 'Confirmed cleaning job',
  },
  {
    id: '3',
    category_id: 1,
    status: 'in_progress',
    title: 'Plumbing in progress',
  },
].map((row) => ({
  ...row,
  address: 'QC',
  budget: 500,
  urgency: 'normal',
  posted_at: '2026-10-03T00:00:00Z',
}));
beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  clearRetainedState();
  (api.categories as jest.Mock).mockResolvedValue([
    { id: 1, name: 'Plumbing' },
    { id: 2, name: 'Cleaning' },
  ]);
  (api.myJobs as jest.Mock).mockImplementation(async (filters) =>
    rows.filter(
      (row) =>
        (filters.category_id === undefined ||
          row.category_id === filters.category_id) &&
        (filters.status_group === undefined ||
          (filters.status_group === 'active'
            ? ['open', 'recommending'].includes(row.status)
            : filters.status_group === 'ongoing'
              ? ['assigned', 'confirmed', 'in_progress'].includes(row.status)
              : row.status === filters.status_group)),
    ),
  );
});
afterEach(() => jest.restoreAllMocks());
it('combines categories with Active/Ongoing and clears both selections', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Open plumbing job');
  fireEvent.press(screen.getByText('Plumbing'));
  fireEvent.press(screen.getByText('Ongoing'));
  await screen.findByText('Plumbing in progress');
  expect(screen.queryByText('Confirmed cleaning job')).toBeNull();
  expect(screen.queryByText('Open plumbing job')).toBeNull();
  fireEvent.press(screen.getByText('Active'));
  await screen.findByText('Open plumbing job');
  expect(screen.queryByText('Plumbing in progress')).toBeNull();
  fireEvent.press(screen.getByText('Clear filters'));
  await screen.findByText('Confirmed cleaning job');
  expect(screen.getByText('Plumbing in progress')).toBeTruthy();
});
it('retains the category/status and restores scroll after opening a job and returning', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const navigate = jest.fn();
  const view = render(<MyJobs onNavigate={navigate} />);
  await screen.findByText('Plumbing');
  fireEvent.press(screen.getByText('Plumbing'));
  fireEvent.press(screen.getByText('Ongoing'));
  await screen.findByText('Plumbing in progress');
  fireEvent.scroll(screen.getByTestId('my-jobs-list'), {
    nativeEvent: { contentOffset: { y: 400 } },
  });
  fireEvent.press(screen.getByText('Plumbing in progress'));
  expect(navigate).toHaveBeenCalledWith('Job Detail', '3');
  view.unmount();
  render(<MyJobs onNavigate={navigate} />);
  await screen.findByText('Plumbing in progress');
  expect(screen.queryByText('Confirmed cleaning job')).toBeNull();
  fireEvent(screen.getByTestId('my-jobs-list'), 'contentSizeChange', 300, 2000);
  expect(scrollTo).toHaveBeenCalledWith({ y: 400, animated: false });
  expect(api.myJobs).toHaveBeenLastCalledWith({
    category_id: 1,
    status_group: 'ongoing',
  });
});
it('reports an empty combined filter accurately', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning');
  fireEvent.press(screen.getByText('Cleaning'));
  fireEvent.press(screen.getByText('Active'));
  await screen.findByText('No matching jobs');
  expect(screen.getByText('Clear filters')).toBeTruthy();
});
it('shows loading and errors, and retries without losing filters', async () => {
  (api.myJobs as jest.Mock).mockRejectedValueOnce(
    new Error('Unable to load jobs'),
  );
  render(<MyJobs onNavigate={jest.fn()} />);
  expect(screen.getByLabelText('Loading content')).toBeTruthy();
  await screen.findByText('Unable to load jobs');
  fireEvent.press(screen.getByText('Try again'));
  await screen.findByText('Open plumbing job');
  expect(screen.queryByText('Unable to load jobs')).toBeNull();
});
