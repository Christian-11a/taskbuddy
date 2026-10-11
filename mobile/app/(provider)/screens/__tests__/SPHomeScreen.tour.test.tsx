import React from 'react';
import { View } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPHomeScreen from '../SPHomeScreen';
import { TourProvider, useTour, type TourControls } from '../../../../src/components/tour';
import type { TourRect } from '../../../../src/components/tour/types';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/context/NotificationsContext', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, reload: jest.fn() }),
}));

jest.mock('../../../../src/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    browseJobs: jest.fn(),
    assignedJobs: jest.fn(),
    myApplications: jest.fn(),
    setAvailability: jest.fn(),
    myVerification: jest.fn(),
  },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Where each Home control sits, keyed by testID, as measureInWindow reports it.
const RECTS: Record<string, TourRect> = {
  'home-availability': { x: 16, y: 210, width: 343, height: 64 },
  'feed-search': { x: 16, y: 290, width: 343, height: 48 },
};

const measureSpy = (View.prototype as unknown as { measureInWindow: jest.Mock }).measureInWindow;

let controls: TourControls;
function Probe() {
  controls = useTour();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  // Verified, so the availability toggle and the feed search are on screen.
  (useAuth as jest.Mock).mockReturnValue({
    profile: { full_name: 'Ana', city: 'Cebu', latitude: null, longitude: null },
    providerProfile: { is_available: true, service_radius_km: 25 },
    isVerified: true,
    refreshProfile: jest.fn(),
  });
  (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
  (api.assignedJobs as jest.Mock).mockResolvedValue([]);
  (api.myApplications as jest.Mock).mockResolvedValue([]);
  measureSpy.mockReset();
  measureSpy.mockImplementation(function (this: { props: { testID?: string } }, callback: (...args: number[]) => void) {
    const rect = RECTS[this.props.testID ?? ''];
    if (rect) callback(rect.x, rect.y, rect.width, rect.height);
    else callback(0, 0, 0, 0);
  });
});

describe('SPHomeScreen — welcome tour anchors', () => {
  // A one-step tour on the anchor shows its card only if the control was found and measured.
  it.each([
    ['home.availability', 'Be seen'],
    ['home.feed', 'Open jobs near you'],
  ])('%s is a spotlight target, so its step is shown', async (anchorId, title) => {
    render(
      <TourProvider>
        <Probe />
        <SPHomeScreen onNavigate={jest.fn()} />
      </TourProvider>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText('Search open jobs')).toBeTruthy());

    act(() => {
      controls.startTour({ steps: [{ anchorId, title, body: 'Body copy' }], onFinish: jest.fn(), onSkip: jest.fn() });
    });

    // The card reads "Step 1 of 1. {title}. {body}", which only the tour card has, unlike the title alone.
    await waitFor(() => expect(screen.getByLabelText(`Step 1 of 1. ${title}. Body copy`)).toBeTruthy());
  });
});

describe('SPHomeScreen — take-the-tour card', () => {
  it('shows the offer at the top of Home and passes its two taps on', async () => {
    const onStart = jest.fn();
    const onDismiss = jest.fn();
    render(<SPHomeScreen onNavigate={jest.fn()} tourOffer={{ onStart, onDismiss }} />);

    fireEvent.press(await screen.findByRole('button', { name: 'Take the tour' }));
    expect(onStart).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByRole('button', { name: 'Dismiss the tour offer' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows no offer when the App is not offering one', async () => {
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    await waitFor(() => expect(screen.getByPlaceholderText('Search open jobs')).toBeTruthy());

    expect(screen.queryByText('New: take a quick tour')).toBeNull();
  });
});
