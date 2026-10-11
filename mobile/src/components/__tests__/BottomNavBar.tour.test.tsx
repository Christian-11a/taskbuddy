import React from 'react';
import { Dimensions, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ClipboardList, Home, User, Wallet } from 'lucide-react-native';
import BottomNavBar, { type BottomNavItem } from '../BottomNavBar';
import { TourProvider, useTour, type TourControls } from '../tour';
import { dimPath } from '../tour/TourOverlay';
import type { TourRect } from '../tour/types';

type Key = 'Home' | 'My Jobs' | 'Wallet' | 'Profile';

// The "My Jobs" tab names its tour anchor `tab.jobs`; the others use their key.
const TABS: readonly BottomNavItem<Key>[] = [
  { key: 'Home', label: 'Home', icon: Home },
  { key: 'My Jobs', label: 'My Jobs', icon: ClipboardList, tourId: 'jobs' },
  { key: 'Wallet', label: 'Wallet', icon: Wallet },
  { key: 'Profile', label: 'Profile', icon: User },
];

// Where each tab sits, keyed by its testID, as measureInWindow reports it.
const RECTS: Record<string, TourRect> = {
  'nav-tab-Home': { x: 20, y: 700, width: 80, height: 70 },
  'nav-tab-My Jobs': { x: 110, y: 700, width: 80, height: 70 },
  'nav-tab-Wallet': { x: 200, y: 700, width: 80, height: 70 },
  'nav-tab-Profile': { x: 290, y: 700, width: 80, height: 70 },
};

type MeasuredView = { props: { testID?: string } };
const measureSpy = (View.prototype as unknown as { measureInWindow: jest.Mock }).measureInWindow;

let controls: TourControls;
function Probe() {
  controls = useTour();
  return null;
}

beforeEach(() => {
  measureSpy.mockReset();
  measureSpy.mockImplementation(function (this: MeasuredView, callback: (...args: number[]) => void) {
    const rect = RECTS[this.props.testID ?? ''];
    if (rect) callback(rect.x, rect.y, rect.width, rect.height);
    else callback(0, 0, 0, 0);
  });
});

// The dim layer's hole, as the overlay draws it: the tab's rectangle padded by 8.
function holeFor(testID: string) {
  const rect = RECTS[testID];
  const { width, height } = Dimensions.get('window');
  return dimPath(rect.x - 8, rect.y - 8, rect.width + 16, rect.height + 16, width, height, 14);
}

describe('BottomNavBar with a TourProvider', () => {
  it('renders the same tabs, in order, with the active one selected', () => {
    render(
      <TourProvider>
        <BottomNavBar activeTab="Home" tabs={TABS} onTabPress={jest.fn()} />
      </TourProvider>,
    );

    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(['Home', 'My Jobs', 'Wallet', 'Profile']);
    expect(screen.getByRole('tab', { name: 'Home' }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  });

  it('still reports the key of a tab that is pressed', () => {
    const onTabPress = jest.fn();
    render(
      <TourProvider>
        <BottomNavBar activeTab="Home" tabs={TABS} onTabPress={onTabPress} />
      </TourProvider>,
    );

    fireEvent.press(screen.getByRole('tab', { name: 'Wallet' }));

    expect(onTabPress).toHaveBeenCalledTimes(1);
    expect(onTabPress).toHaveBeenCalledWith('Wallet');
  });

  it('lets a tour point at a tab by its key, and at a tab with a tourId by tab.<tourId>', async () => {
    render(
      <TourProvider>
        <Probe />
        <BottomNavBar activeTab="Home" tabs={TABS} onTabPress={jest.fn()} />
      </TourProvider>,
    );

    act(() => controls.startTour({
      steps: [
        { anchorId: 'tab.Home', title: 'Home step', body: 'Home body' },
        { anchorId: 'tab.jobs', title: 'Jobs step', body: 'Jobs body' },
      ],
      onFinish: jest.fn(),
      onSkip: jest.fn(),
    }));

    expect(await screen.findByText('Home step')).toBeTruthy();
    // The tab icons are drawn with Paths too, so find the dim layer by its even-odd fill rule.
    expect(screen.UNSAFE_getByProps({ fillRule: 'evenodd' }).props.animatedProps.d).toBe(holeFor('nav-tab-Home'));

    fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Jobs step')).toBeTruthy();
    // The spotlight's new rectangle comes from measuring the jobs tab itself. (Its shared values catch up after the render, so the path is checked on the first step only.)
    expect(measureSpy.mock.contexts.at(-1)?.props.testID).toBe('nav-tab-My Jobs');
  });
});
