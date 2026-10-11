import React from 'react';
import { FlatList, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import OnboardingScreen from '../OnboardingScreen';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: { categories: jest.fn() },
}));

// Mutable window metrics, so a test can set the screen size before rendering.
const mockDims = { width: 390, height: 844, fontScale: 1, scale: 3 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockDims,
}));

type Props = Partial<React.ComponentProps<typeof OnboardingScreen>>;

/** Renders, then flushes the lookup that settles right after mount, so no update lands outside act. */
async function renderOnboarding(role: 'homeowner' | 'provider' | null = 'homeowner', extra: Props = {}) {
  const onFinish = jest.fn();
  const onLogin = jest.fn();
  render(<OnboardingScreen role={role} onFinish={onFinish} onLogin={onLogin} {...extra} />);
  await act(async () => {});
  return { onFinish, onLogin };
}

/** Tells the pager which card is on screen, as a swipe would. */
function showSlide(index: number) {
  const list = screen.UNSAFE_getByType(FlatList);
  act(() => {
    list.props.onViewableItemsChanged({
      viewableItems: [{ index, item: null, key: String(index), isViewable: true }],
    });
  });
}

beforeEach(() => {
  clearAsyncDataCache();
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 390, height: 844 });
  // Pending by default, so no lookup settles after a test ends unless the test sets one up.
  (api.categories as jest.Mock).mockReturnValue(new Promise(() => {}));
});

describe('OnboardingScreen — homeowner (client)', () => {
  it('greets the client by first name on the first card', async () => {
    await renderOnboarding('homeowner', { firstName: 'Juan' });

    expect(screen.getByText('Hi Juan, help is close by')).toBeTruthy();
    expect(screen.getByText('Book trusted local pros for plumbing, cleaning, repairs and more.')).toBeTruthy();
  });

  it('says "there" when the name is not known yet', async () => {
    await renderOnboarding('homeowner');

    expect(screen.getByText('Hi there, help is close by')).toBeTruthy();
  });

  it('shows the three cards in order, and no card says "File a complaint"', async () => {
    await renderOnboarding('homeowner', { firstName: 'Juan' });

    expect(screen.getByText('You choose who comes')).toBeTruthy();
    expect(screen.getByText('Your money waits until the job is done')).toBeTruthy();
    expect(screen.queryByText(/File a complaint/i)).toBeNull();
  });

  it('moves on with Next and ends on "Show me around", which finishes the walkthrough', async () => {
    const { onFinish } = await renderOnboarding('homeowner');
    expect(screen.getByText('Next')).toBeTruthy();

    showSlide(2);
    expect(screen.getByText('Show me around')).toBeTruthy();
    fireEvent.press(screen.getByText('Show me around'));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingScreen — the client\'s service chips', () => {
  it('shows up to three real service names on the first card once they load', async () => {
    (api.categories as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Plumbing' },
      { id: 2, name: 'Cleaning' },
      { id: 3, name: 'Handyman' },
      { id: 4, name: 'Manicure' },
    ]);
    await renderOnboarding('homeowner', { firstName: 'Juan' });

    await waitFor(() => expect(screen.getByText('Plumbing')).toBeTruthy());
    expect(screen.getByText('Cleaning')).toBeTruthy();
    expect(screen.getByText('Handyman')).toBeTruthy();
    expect(screen.queryByText('Manicure')).toBeNull();
  });

  it('shows no service names when the categories cannot load, and the card still reads normally', async () => {
    (api.categories as jest.Mock).mockRejectedValue(new Error('offline'));
    await renderOnboarding('homeowner', { firstName: 'Juan' });

    await waitFor(() => expect(api.categories).toHaveBeenCalled());
    expect(screen.queryByText('Plumbing')).toBeNull();
    expect(screen.getByText('Hi Juan, help is close by')).toBeTruthy();
  });
});

describe('OnboardingScreen — provider', () => {
  it('greets the provider by first name and says the work comes from the services they offer', async () => {
    await renderOnboarding('provider', { firstName: 'Ana' });

    expect(screen.getByText("Hi Ana, let's get you hired")).toBeTruthy();
    expect(screen.getByText('Find jobs near you in the services you offer.')).toBeTruthy();
  });

  it('last card says the payment is held and released after the job and the warranty', async () => {
    await renderOnboarding('provider');

    showSlide(2);

    expect(screen.getByText('Get paid safely')).toBeTruthy();
    expect(screen.getByText("The client's payment is held and released to you after the job and a 3-day warranty.")).toBeTruthy();
  });

  it('does not look up service categories, since its pictures are icon-only', async () => {
    await renderOnboarding('provider');

    expect(api.categories).not.toHaveBeenCalled();
  });

  it('the final button reads Show me around and finishes the walkthrough', async () => {
    const { onFinish } = await renderOnboarding('provider');

    showSlide(2);
    fireEvent.press(screen.getByText('Show me around'));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingScreen — skip', () => {
  it('Skip is on screen from the first card and calls the skip handler, not finish', async () => {
    const { onLogin, onFinish } = await renderOnboarding('homeowner');

    fireEvent.press(screen.getByText('Skip'));

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('on a replay the same control reads Close and still leaves without finishing', async () => {
    const { onLogin, onFinish } = await renderOnboarding('homeowner', { replay: true });

    expect(screen.queryByText('Skip')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });
});

describe('OnboardingScreen — layout', () => {
  /** The picture tile's minimum height on each card, in dp. */
  const tileHeights = () => screen.getAllByTestId('intro-illustration').map((tile) => StyleSheet.flatten(tile.props.style).minHeight);

  /** Each card's content style, from the ScrollView each card renders (the list renders all three). */
  const cardContentStyles = () => screen.UNSAFE_getAllByProps({ testID: 'intro-card' })
    .filter((element) => element.type === ScrollView)
    .map((element) => StyleSheet.flatten(element.props.contentContainerStyle));

  it('grows the picture to 280 dp on a tall screen', async () => {
    mockDims.height = 1600;
    await renderOnboarding('homeowner');

    expect(tileHeights()).toEqual([280, 280, 280]);
  });

  it('sizes the picture at 34% of the screen height while that stays between 210 and 280 dp', async () => {
    mockDims.height = 640;
    await renderOnboarding('homeowner');

    tileHeights().forEach((height) => expect(height).toBeCloseTo(0.34 * 640));
  });

  it('keeps the picture at least 210 dp tall on a short screen', async () => {
    mockDims.height = 500;
    await renderOnboarding('homeowner');

    expect(tileHeights()).toEqual([210, 210, 210]);
  });

  it('centres each card\'s content in the space above the dots, and lets it scroll when it does not fit', async () => {
    await renderOnboarding('homeowner');

    const styles = cardContentStyles();
    expect(styles).toHaveLength(3);
    styles.forEach((style) => expect(style).toEqual(expect.objectContaining({ flexGrow: 1, justifyContent: 'center' })));
  });

  it('breaks the card title into balanced lines, so no single word is left alone on a line', async () => {
    await renderOnboarding('homeowner', { firstName: 'Juan' });

    expect(screen.getByText('Hi Juan, help is close by').props.textBreakStrategy).toBe('balanced');
  });
});
