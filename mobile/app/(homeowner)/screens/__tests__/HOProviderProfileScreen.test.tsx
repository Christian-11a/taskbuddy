import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import HOProviderProfileScreen from '../HOProviderProfileScreen';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    getProvider: jest.fn(),
    getProviderReviews: jest.fn(),
    getProviderWork: jest.fn(),
    providerPortfolio: jest.fn(),
  },
}));

const provider = {
  profile_id: 'prov-1',
  category_id: 1,
  bio: 'Ten years of window and gutter work.',
  years_experience: 2,
  is_available: true,
  is_verified: true,
  service_radius_km: 10,
  cached_avg_rating: 4.5,
  cached_ratings_count: 4,
  cached_completed_jobs: 3,
  service_categories: { name: 'Cleaning' },
  approved_secondary_services: [],
  profiles: { full_name: 'Alex Reyes', avatar_url: null, city: 'Cebu' },
};

const offer = {
  providerName: 'Alex Reyes',
  jobTitle: 'Window cleaning',
  message: 'I can come Friday evening.',
  onHire: jest.fn(),
};

async function renderProfile(props: Partial<React.ComponentProps<typeof HOProviderProfileScreen>> = {}) {
  render(<HOProviderProfileScreen id="prov-1" onBack={jest.fn()} {...props} />);
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  offer.onHire = jest.fn();
  (api.getProvider as jest.Mock).mockResolvedValue(provider);
  (api.getProviderReviews as jest.Mock).mockResolvedValue([]);
  (api.getProviderWork as jest.Mock).mockResolvedValue([]);
  (api.providerPortfolio as jest.Mock).mockResolvedValue([]);
});

describe('HOProviderProfileScreen: the public profile', () => {
  it('shows rating, jobs done and experience in one stats card', async () => {
    await renderProfile();

    expect(await screen.findByText('4.5')).toBeTruthy();
    expect(screen.getByText('Rating')).toBeTruthy();
    expect(screen.getByText('Jobs done')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Experience')).toBeTruthy();
    expect(screen.getByText('2 yrs')).toBeTruthy();
  });

  it('hides the experience chip when the provider never set their years, instead of showing 0 yrs', async () => {
    (api.getProvider as jest.Mock).mockResolvedValue({ ...provider, years_experience: 0 });
    await renderProfile();

    expect(await screen.findByText('Jobs done')).toBeTruthy();
    expect(screen.queryByText('0 yrs')).toBeNull();
    expect(screen.queryByText('Experience')).toBeNull();
    expect(screen.getByText('Rating')).toBeTruthy();
  });

  it('hides the experience chip when the years are missing altogether', async () => {
    (api.getProvider as jest.Mock).mockResolvedValue({ ...provider, years_experience: null });
    await renderProfile();

    expect(await screen.findByText('Jobs done')).toBeTruthy();
    expect(screen.queryByText('Experience')).toBeNull();
  });

  it('hides the sections that have nothing in them', async () => {
    (api.getProvider as jest.Mock).mockResolvedValue({ ...provider, bio: null });
    await renderProfile();

    await screen.findByText('Alex Reyes');
    expect(screen.queryByText('About')).toBeNull();
    expect(screen.queryByText('Portfolio')).toBeNull();
    expect(screen.queryByText('No portfolio photos yet.')).toBeNull();
    expect(screen.queryByText('Recent work')).toBeNull();
    expect(screen.queryByText('No completed jobs on TaskBuddy yet.')).toBeNull();
    expect(screen.queryByText('Reviews')).toBeNull();
    expect(screen.queryByText('No reviews yet.')).toBeNull();
  });

  it('shows the sections that do have something in them', async () => {
    (api.getProviderWork as jest.Mock).mockResolvedValue([
      { id: 'w1', title: 'Unclog drain', completed_at: '2026-10-06T00:00:00Z', service_categories: { name: 'Plumbing' } },
    ]);
    await renderProfile();

    expect(await screen.findByText('Recent work')).toBeTruthy();
    expect(screen.getByText('Unclog drain')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText('Ten years of window and gutter work.')).toBeTruthy();
  });
});

describe('HOProviderProfileScreen: opened from a proposal', () => {
  it('shows this job\'s offer from the provider', async () => {
    await renderProfile({ proposal: offer });

    expect(await screen.findByText('Their offer for Window cleaning')).toBeTruthy();
    expect(screen.getByText('I can come Friday evening.')).toBeTruthy();
  });

  it('ends with a Hire button and a link back to proposals', async () => {
    await renderProfile({ proposal: offer });

    expect(await screen.findByRole('button', { name: 'Hire Alex Reyes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to proposals' })).toBeTruthy();
  });

  it('Hire calls onHire once, and Back to proposals calls onBack', async () => {
    const onBack = jest.fn();
    await renderProfile({ proposal: offer, onBack });

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes' }));
    expect(offer.onHire).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Back to proposals' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(offer.onHire).toHaveBeenCalledTimes(1);
  });
});

describe('HOProviderProfileScreen: opened without a proposal', () => {
  it('has no Hire button and no proposal link', async () => {
    await renderProfile();

    await screen.findByText('Alex Reyes');
    expect(screen.queryByRole('button', { name: /^Hire / })).toBeNull();
    expect(screen.queryByText('Back to proposals')).toBeNull();
    expect(screen.queryByText(/Their offer/)).toBeNull();
  });
});
