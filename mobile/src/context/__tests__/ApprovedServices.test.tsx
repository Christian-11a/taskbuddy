import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import SPSkillRequestScreen from '../../../app/(provider)/screens/SPSkillRequestScreen';
import SPProfileScreen from '../../../app/(provider)/screens/SPProfileScreen';
import HOProviderProfileScreen from '../../../app/(homeowner)/screens/HOProviderProfileScreen';
import { useAuth } from '../AuthContext';
import { api } from '../../lib/api';
import { clearAsyncDataCache } from '../../hooks/useAsyncData';

jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../NotificationsContext', () => ({
  useNotifications: () => ({ notifications: [] }),
}));
jest.mock('../../lib/api', () => ({
  api: {
    categories: jest.fn(),
    mySkillRequests: jest.fn(),
    assignedJobs: jest.fn(),
    getProvider: jest.fn(),
    getProviderReviews: jest.fn(),
    getProviderWork: jest.fn(),
    providerPortfolio: jest.fn(),
  },
}));
const services = {
  category_id: 1,
  is_verified: true,
  service_categories: { id: 1, name: 'Plumbing' },
  approved_secondary_services: [
    { category_id: 2, service_categories: { id: 2, name: 'Pedicure' } },
  ],
};
beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (useAuth as jest.Mock).mockReturnValue({
    profile: { id: 'provider', full_name: 'Alex' },
    providerProfile: services,
    refreshProfile: jest.fn().mockResolvedValue(undefined),
  });
  (api.categories as jest.Mock).mockResolvedValue([
    { id: 1, name: 'Plumbing' },
    { id: 2, name: 'Pedicure' },
    { id: 3, name: 'Cleaning' },
  ]);
  (api.providerPortfolio as jest.Mock).mockResolvedValue([]);
  (api.mySkillRequests as jest.Mock).mockResolvedValue([]);
  (api.assignedJobs as jest.Mock).mockResolvedValue([]);
  (api.getProvider as jest.Mock).mockResolvedValue({
    ...services,
    profiles: { full_name: 'Alex' },
  });
  (api.getProviderReviews as jest.Mock).mockResolvedValue([]);
  (api.getProviderWork as jest.Mock).mockResolvedValue([]);
});
it('shows approved services while offering only categories the provider does not already offer', async () => {
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await screen.findByText('Cleaning');
  expect(screen.getByText('APPROVED ADDITIONAL SERVICES')).toBeTruthy();
  // Each offered service occurs only in the approved list, not again as a request chip.
  expect(screen.getAllByText('Plumbing')).toHaveLength(1);
  expect(screen.getAllByText('Pedicure')).toHaveLength(1);
});
it('keeps a rejected service in history without presenting it as approved', async () => {
  (useAuth as jest.Mock).mockReturnValue({
    providerProfile: { ...services, approved_secondary_services: [] },
    refreshProfile: jest.fn().mockResolvedValue(undefined),
  });
  (api.mySkillRequests as jest.Mock).mockResolvedValue([
    {
      id: 'r1',
      type: 'add_secondary',
      status: 'rejected',
      category: { name: 'Pedicure' },
      reason: 'Ten years of experience',
      created_at: '2026-10-01T00:00:00Z',
      reviewed_at: '2026-10-02T00:00:00Z',
    },
  ]);
  render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await screen.findByText('Not approved');
  expect(screen.queryByText('APPROVED ADDITIONAL SERVICES')).toBeNull();
  expect(screen.getByText('Plumbing')).toBeTruthy();
});
it('renders every approved service on the provider own profile', async () => {
  render(
    <SPProfileScreen
      onNavigate={jest.fn()}
      onLogout={jest.fn()}
      onBack={jest.fn()}
    />,
  );
  await act(async () => {});
  expect(
    screen.getByText('Plumbing · Pedicure · Provider profile'),
  ).toBeTruthy();
});
it('renders approved services on a public profile and obtains current data when reopened', async () => {
  const view = render(<HOProviderProfileScreen id="provider" />);
  await screen.findByText('Plumbing · Pedicure');
  view.unmount();
  (api.getProvider as jest.Mock).mockResolvedValue({
    ...services,
    approved_secondary_services: [
      { category_id: 3, service_categories: { id: 3, name: 'Cleaning' } },
    ],
    profiles: { full_name: 'Alex' },
  });
  render(<HOProviderProfileScreen id="provider" />);
  await waitFor(() =>
    expect(screen.getByText('Plumbing · Cleaning')).toBeTruthy(),
  );
  expect(screen.queryByText('Plumbing · Pedicure')).toBeNull();
});

it('loads and opens the portfolio from the client proposal profile', async () => {
  (api.providerPortfolio as jest.Mock).mockResolvedValue([
    {
      id: 'portfolio',
      caption: 'Published sink repair',
      image_url: 'https://test/work.jpg',
      position: 0,
    },
  ]);
  render(<HOProviderProfileScreen id="provider" />);
  fireEvent.press(
    await screen.findByLabelText('View portfolio photo: Published sink repair'),
  );
  expect(api.providerPortfolio).toHaveBeenCalledWith('provider');
  expect(screen.getByTestId('full-photo').props.source.uri).toBe(
    'https://test/work.jpg',
  );
});
