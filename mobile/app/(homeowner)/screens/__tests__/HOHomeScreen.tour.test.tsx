import React from 'react';
import { View } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import HOHomeScreen from '../HOHomeScreen';
import { TourProvider, useTour, type TourControls } from '../../../../src/components/tour';
import type { TourRect } from '../../../../src/components/tour/types';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/context/NotificationsContext', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, reload: jest.fn() }),
}));

jest.mock('../../../../src/lib/api', () => ({
  api: {
    wallet: jest.fn(),
    myJobs: jest.fn(),
    categories: jest.fn(),
    notifications: jest.fn(),
    unreadNotificationCount: jest.fn(),
    jobApplications: jest.fn(),
  },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Where each Home control sits, keyed by testID, as measureInWindow reports it.
const RECTS: Record<string, TourRect> = {
  'home-post-job': { x: 16, y: 150, width: 340, height: 54 },
  'home-wallet': { x: 230, y: 40, width: 90, height: 36 },
  'home-bell': { x: 330, y: 36, width: 44, height: 44 },
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
  (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: 'Alex', city: null, address: null } });
  (api.wallet as jest.Mock).mockResolvedValue({ balance: 0, available: 0, held: 0 });
  (api.myJobs as jest.Mock).mockResolvedValue([]);
  (api.categories as jest.Mock).mockResolvedValue([]);
  (api.notifications as jest.Mock).mockResolvedValue([]);
  (api.unreadNotificationCount as jest.Mock).mockResolvedValue({ count: 0 });
  measureSpy.mockReset();
  measureSpy.mockImplementation(function (this: { props: { testID?: string } }, callback: (...args: number[]) => void) {
    const rect = RECTS[this.props.testID ?? ''];
    if (rect) callback(rect.x, rect.y, rect.width, rect.height);
    else callback(0, 0, 0, 0);
  });
});

describe('HOHomeScreen — welcome tour anchors', () => {
  // A one-step tour on the anchor shows its card only if the control was found and measured;
  // a missing anchor would pass the step over and the card would never appear.
  it.each([
    ['home.post', 'Start here'],
    ['home.wallet', 'Your wallet'],
    ['home.bell', 'Never miss an offer'],
  ])('%s is a spotlight target, so its step is shown', async (anchorId, title) => {
    render(
      <TourProvider>
        <Probe />
        <HOHomeScreen onNavigate={jest.fn()} />
      </TourProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('What do you need done?')).toBeTruthy());

    act(() => {
      controls.startTour({ steps: [{ anchorId, title, body: 'Body copy' }], onFinish: jest.fn(), onSkip: jest.fn() });
    });

    // The card reads "Step 1 of 1. {title}. {body}", which only the tour card has, unlike the title alone.
    await waitFor(() => expect(screen.getByLabelText(`Step 1 of 1. ${title}. Body copy`)).toBeTruthy());
  });
});
