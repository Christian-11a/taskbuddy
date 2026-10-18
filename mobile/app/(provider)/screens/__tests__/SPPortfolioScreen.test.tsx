import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { AppState, TextInput, type AppStateStatus } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import ContentSkeleton from '../../../../src/components/ui/ContentSkeleton';
import SPPortfolioScreen, {
  PHOTO_MAX_BYTES,
  PORTFOLIO_LIMIT,
  nextPortfolioPosition,
  PORTFOLIO_POSITION_MAX,
  portfolioDetails,
  portfolioIsFull,
  publishProblem,
  publishProgress,
} from '../SPPortfolioScreen';
import { api } from '../../../../src/lib/api';
import * as ImagePicker from 'expo-image-picker';
import { requestAppPermission } from '../../../../src/lib/permissions';
import { useAuth } from '../../../../src/context/AuthContext';
jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../../../../src/lib/api', () => ({
  api: {
    myPortfolio: jest.fn(),
    uploadImage: jest.fn(),
    createPortfolio: jest.fn(),
    updatePortfolio: jest.fn(),
    removePortfolio: jest.fn(),
  },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('../../../../src/lib/permissions', () => ({
  requestAppPermission: jest.fn(),
}));
const entry = {
  id: 'photo',
  caption: 'Old caption',
  image_url: 'https://photo',
  position: 4,
  category_id: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ providerProfile: null });
  (api.myPortfolio as jest.Mock).mockResolvedValue([]);
  (api.uploadImage as jest.Mock).mockResolvedValue('owner/photo.jpg');
  (api.createPortfolio as jest.Mock).mockResolvedValue({ id: 'photo' });
  (api.updatePortfolio as jest.Mock).mockResolvedValue({ id: 'photo' });
  (api.removePortfolio as jest.Mock).mockResolvedValue({ removed: true });
  (requestAppPermission as jest.Mock).mockResolvedValue(true);
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg' }],
  });
});
it('an empty portfolio shows the card, with the hint to add a photo', async () => {
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  const card = await screen.findByTestId('empty-card');
  expect(within(card).getByText('No portfolio photos yet')).toBeTruthy();
  expect(within(card).getByText('Add a photo of finished work so clients can see what you do.')).toBeTruthy();
});
it('a failed portfolio load shows the error in a card, and Try again loads the gallery', async () => {
  (api.myPortfolio as jest.Mock).mockRejectedValueOnce(new Error('Portfolio unavailable'));
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  const card = await screen.findByTestId('error-card');
  expect(within(card).getByText("Couldn't load your portfolio")).toBeTruthy();
  expect(within(card).getByText('Portfolio unavailable')).toBeTruthy();
  fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByTestId('empty-card')).toBeTruthy();
});
it('uploads an owned image, publishes details and refreshes the saved gallery', async () => {
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet');
  await act(async () =>
    fireEvent.press(screen.getByText('Choose portfolio photo')),
  );
  fireEvent.changeText(
    screen.getByLabelText('Caption'),
    'Sink repair',
  );
  (api.myPortfolio as jest.Mock).mockResolvedValue([
    { ...entry, caption: 'Sink repair' },
  ]);
  await act(async () => fireEvent.press(screen.getByText('Publish photo')));
  expect(api.uploadImage).toHaveBeenCalledWith(
    'provider-portfolio',
    'file:///photo.jpg',
  );
  expect(api.createPortfolio).toHaveBeenCalledWith({
    image_path: 'owner/photo.jpg',
    caption: 'Sink repair',
    position: 0,
    category_id: null,
  });
  await screen.findByText('Sink repair');
});
it('edits caption/order without reupload and removes only after confirmation', async () => {
  (api.myPortfolio as jest.Mock).mockResolvedValue([entry]);
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  fireEvent.press(await screen.findByText('Edit photo details'));
  fireEvent.changeText(
    screen.getByLabelText('Caption'),
    'New caption',
  );
  await act(async () =>
    fireEvent.press(screen.getByText('Save photo details')),
  );
  expect(api.updatePortfolio).toHaveBeenCalledWith('photo', {
    caption: 'New caption',
    position: 4,
    category_id: null,
  });
  expect(api.uploadImage).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Remove photo'));
  expect(api.removePortfolio).not.toHaveBeenCalled();
  (api.myPortfolio as jest.Mock).mockResolvedValue([]);
  await act(async () => fireEvent.press(screen.getByText('Remove')));
  expect(api.removePortfolio).toHaveBeenCalledWith('photo');
  await screen.findByText('No portfolio photos yet');
});
it('keeps the form on upload failure and never publishes a missing upload', async () => {
  (api.uploadImage as jest.Mock).mockRejectedValue(new Error('Upload failed'));
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet');
  await act(async () =>
    fireEvent.press(screen.getByText('Choose portfolio photo')),
  );
  fireEvent.changeText(screen.getByLabelText('Caption'), 'Work');
  await act(async () => fireEvent.press(screen.getByText('Publish photo')));
  expect(screen.getByText('Upload failed')).toBeTruthy();
  expect(api.createPortfolio).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Caption').props.value).toBe('Work');
});

describe('portfolio rules', () => {
  it('uses the real limits: 20 photos and 10 MB', () => {
    expect(PORTFOLIO_LIMIT).toBe(20);
    expect(PHOTO_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it('treats a portfolio of 20 photos as full', () => {
    expect(portfolioIsFull(19)).toBe(false);
    expect(portfolioIsFull(20)).toBe(true);
  });

  it('sends the position it is given: the next one for a new photo, the stored one for an edit', () => {
    expect(portfolioDetails({ caption: '  Sink repair  ', categoryId: null, position: 3 })).toEqual({
      caption: 'Sink repair',
      position: 3,
      category_id: null,
    });
    expect(portfolioDetails({ caption: 'New caption', categoryId: 3, position: 4 })).toEqual({
      caption: 'New caption',
      position: 4,
      category_id: 3,
    });
  });

  it('puts a new photo after the highest position, and at 0 in an empty portfolio', () => {
    expect(nextPortfolioPosition([])).toBe(0);
    expect(nextPortfolioPosition([{ position: 0 }, { position: 1 }, { position: 2 }])).toBe(3);
    expect(nextPortfolioPosition([{ position: 7 }, { position: 3 }])).toBe(8);
  });

  it('does not fill gaps: the new photo goes after the highest position', () => {
    expect(nextPortfolioPosition([{ position: 0 }, { position: 5 }, { position: 2 }])).toBe(6);
  });

  it('never goes past the API maximum position of 10000', () => {
    expect(PORTFOLIO_POSITION_MAX).toBe(10000);
    expect(nextPortfolioPosition([{ position: 9999 }])).toBe(10000);
    expect(nextPortfolioPosition([{ position: 10000 }])).toBe(10000);
  });

  it('names the first thing missing from a publish', () => {
    expect(publishProblem({ caption: 'Work', hasPhoto: false, editing: false })).toBe('Choose a photo to publish.');
    expect(publishProblem({ caption: '   ', hasPhoto: true, editing: false })).toBe('Add a caption to publish this photo.');
    expect(publishProblem({ caption: '   ', hasPhoto: false, editing: true })).toBe('Add a caption to publish this photo.');
    expect(publishProblem({ caption: 'Work', hasPhoto: true, editing: false })).toBeNull();
    expect(publishProblem({ caption: 'Work', hasPhoto: false, editing: true })).toBeNull();
  });

  it('describes the real upload and save stages', () => {
    expect(publishProgress('uploading', false)).toEqual({ label: 'Uploading photo…', segments: ['active', 'todo'] });
    expect(publishProgress('saving', false)).toEqual({ label: 'Saving to your portfolio…', segments: ['done', 'active'] });
    expect(publishProgress('saving', true)).toEqual({ label: 'Saving changes…', segments: ['active'] });
  });
});

it('states the limits and photo tips before publishing, with no display order field', async () => {
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet');
  expect(screen.getByText('Up to 20 photos, 10 MB each (JPEG, PNG or WebP). Signed-in clients can see them.')).toBeTruthy();
  expect(screen.getByText('Your own work only')).toBeTruthy();
  expect(screen.getByText('No client faces or house numbers')).toBeTruthy();
  expect(screen.getByText('Good light')).toBeTruthy();
  expect(screen.queryByLabelText('Portfolio display order')).toBeNull();
  expect(screen.queryByText(/Display order/)).toBeNull();
});

it('caps the caption at 400 characters', async () => {
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet');
  expect(screen.getByLabelText('Caption').props.maxLength).toBe(400);
});

it('counts the caption as it is typed, out of 400', async () => {
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet');
  const typed = 'Sink repair';

  fireEvent.changeText(screen.getByLabelText('Caption'), typed);

  expect(screen.getByText(`${typed.length} / 400`)).toBeTruthy();
});

describe('caption rules', () => {
  it('refuses a caption over 400 characters, and says how to shorten it', () => {
    expect(publishProblem({ caption: 'x'.repeat(400), hasPhoto: true, editing: false })).toBeNull();
    expect(publishProblem({ caption: 'x'.repeat(401), hasPhoto: true, editing: false })).toBe(
      'Shorten the caption to 400 characters or fewer.',
    );
  });

  it('treats a caption of only spaces or blank lines as empty', () => {
    expect(publishProblem({ caption: ' \n\n\t ', hasPhoto: true, editing: false })).toBe(
      'Add a caption to publish this photo.',
    );
  });

  it('sends the caption trimmed, with the blank lines inside it kept as typed', () => {
    expect(portfolioDetails({ caption: '  Sink repair\n\n\n\nDone.  ', categoryId: 1, position: 0 })).toEqual({
      caption: 'Sink repair\n\n\n\nDone.',
      position: 0,
      category_id: 1,
    });
  });
});

it('rejects a photo over 10 MB before uploading it', async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///big.jpg', fileSize: 10 * 1024 * 1024 + 1 }],
  });
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet');
  await act(async () => fireEvent.press(screen.getByText('Choose portfolio photo')));
  expect(await screen.findByText('Choose a photo no larger than 10 MB.')).toBeTruthy();
  expect(api.uploadImage).not.toHaveBeenCalled();
});

it('shows the real upload and save stages while a photo publishes', async () => {
  let finishUpload!: (path: string) => void;
  let finishSave!: (value: { id: string }) => void;
  (api.uploadImage as jest.Mock).mockReturnValue(new Promise<string>((resolve) => { finishUpload = resolve; }));
  (api.createPortfolio as jest.Mock).mockReturnValue(new Promise<{ id: string }>((resolve) => { finishSave = resolve; }));
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet');
  await act(async () => fireEvent.press(screen.getByText('Choose portfolio photo')));
  fireEvent.changeText(screen.getByLabelText('Caption'), 'Sink repair');
  fireEvent.press(screen.getByText('Publish photo'));
  expect(await screen.findByText('Uploading photo…')).toBeTruthy();
  await act(async () => finishUpload('owner/photo.jpg'));
  expect(await screen.findByText('Saving to your portfolio…')).toBeTruthy();
  await act(async () => finishSave({ id: 'photo' }));
  await waitFor(() => expect(screen.queryByText('Saving to your portfolio…')).toBeNull());
});

it('stops the form at 20 photos and says why', async () => {
  const full = Array.from({ length: PORTFOLIO_LIMIT }, (_, index) => ({
    ...entry,
    id: `photo-${index}`,
    caption: `Work ${index}`,
    image_url: `https://photo/${index}`,
  }));
  (api.myPortfolio as jest.Mock).mockResolvedValue(full);
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  expect(await screen.findByText(/Your portfolio is full: 20 of 20 photos/)).toBeTruthy();
  expect(screen.queryByText('Publish photo')).toBeNull();
  expect(screen.queryByLabelText('Caption')).toBeNull();
});

it('gives a new photo the position after the last one in the list', async () => {
  (api.myPortfolio as jest.Mock).mockResolvedValue([
    { ...entry, id: 'first', position: 0 },
    { ...entry, id: 'second', position: 4 },
  ]);
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findAllByText('Remove photo');
  await act(async () => fireEvent.press(screen.getByText('Choose portfolio photo')));
  fireEvent.changeText(screen.getByLabelText('Caption'), 'Sink repair');
  await act(async () => fireEvent.press(screen.getByText('Publish photo')));
  expect(api.createPortfolio).toHaveBeenCalledWith({
    image_path: 'owner/photo.jpg',
    caption: 'Sink repair',
    position: 5,
    category_id: null,
  });
});

it('does not publish a new photo until the portfolio has loaded', async () => {
  (api.myPortfolio as jest.Mock).mockRejectedValue(new Error('Portfolio unavailable'));
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText(/Portfolio unavailable/);
  expect(screen.getByRole('button', { name: 'Publish photo' })).toBeDisabled();
});

it('every control has an accessible name: photo thumbnails, edit and remove', async () => {
  (api.myPortfolio as jest.Mock).mockResolvedValue([entry]);
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('Old caption');

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});

describe('SPPortfolioScreen — a refresh keeps the gallery on screen', () => {
  /** Captures the app-state listener, so a test can bring the app back to the foreground. */
  function captureAppState() {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
    const comeToForeground = () => {
      act(() => listeners.forEach((listener) => listener('background')));
      act(() => listeners.forEach((listener) => listener('active')));
    };
    return { spy, comeToForeground };
  }

  it('shows skeletons only while no portfolio has loaded yet', () => {
    // The app-state subscription is given back, so the screen can unmount cleanly.
    const { spy } = captureAppState();
    (api.myPortfolio as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<SPPortfolioScreen onBack={jest.fn()} />);

    expect(screen.UNSAFE_queryByType(ContentSkeleton)).toBeTruthy();
    expect(screen.queryByTestId('refresh-bar')).toBeNull();
    spy.mockRestore();
  });

  it('keeps the gallery under a thin progress line while it refreshes, with no skeleton', async () => {
    (api.myPortfolio as jest.Mock).mockResolvedValue([entry]);
    const { spy, comeToForeground } = captureAppState();
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    await screen.findByText('Old caption');

    (api.myPortfolio as jest.Mock).mockReturnValue(new Promise(() => {}));
    comeToForeground();

    expect(screen.getByText('Old caption')).toBeTruthy();
    expect(screen.getByTestId('refresh-bar')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ContentSkeleton)).toBeNull();
    spy.mockRestore();
  });

  it('keeps the gallery when a refresh fails, and shows the error above it with Try again', async () => {
    (api.myPortfolio as jest.Mock).mockResolvedValue([entry]);
    const { spy, comeToForeground } = captureAppState();
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    await screen.findByText('Old caption');

    (api.myPortfolio as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    comeToForeground();

    const card = await screen.findByTestId('error-card');
    expect(within(card).getByText("Couldn't load your portfolio")).toBeTruthy();
    expect(screen.getByText('Old caption')).toBeTruthy();

    (api.myPortfolio as jest.Mock).mockResolvedValue([{ ...entry, caption: 'Fresh caption' }]);
    fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Fresh caption')).toBeTruthy();
    expect(screen.queryByTestId('error-card')).toBeNull();
    spy.mockRestore();
  });
});

describe('SPPortfolioScreen — a photo is filed under the provider\'s own services', () => {
  // The screen gives its app-state subscription back when it unmounts, so this block supplies one.
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const ONE_SERVICE = {
    category_id: 1,
    service_categories: { name: 'Plumbing' },
    approved_secondary_services: [],
  };
  const TWO_SERVICES = {
    category_id: 1,
    service_categories: { name: 'Plumbing' },
    approved_secondary_services: [{ category_id: 2, service_categories: { id: 2, name: 'Cleaning' } }],
  };

  /** Publishes a new photo with this caption, as the provider would. */
  async function publishNewPhoto(caption: string) {
    await act(async () => fireEvent.press(screen.getByText('Choose portfolio photo')));
    fireEvent.changeText(screen.getByLabelText('Caption'), caption);
    await act(async () => fireEvent.press(screen.getByText('Publish photo')));
  }

  it('with one service, names it in words, offers no chips, and files the photo under it', async () => {
    (useAuth as jest.Mock).mockReturnValue({ providerProfile: ONE_SERVICE });
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    await screen.findByText('No portfolio photos yet');

    expect(screen.getByText('Service: Plumbing')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText('No service category')).toBeNull();
    expect(screen.queryByText(/optional/)).toBeNull();

    await publishNewPhoto('Sink repair');
    expect(api.createPortfolio).toHaveBeenCalledWith(expect.objectContaining({ category_id: 1 }));
  });

  it('with two services, offers only those two as chips, with the first picked, and no "No service" choice', async () => {
    (useAuth as jest.Mock).mockReturnValue({ providerProfile: TWO_SERVICES });
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    await screen.findByText('No portfolio photos yet');

    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual(['Plumbing', 'Cleaning']);
    expect(radios[0].props.accessibilityState.selected).toBe(true);
    expect(radios[1].props.accessibilityState.selected).toBe(false);
    expect(screen.queryByText('No service category')).toBeNull();
    expect(screen.queryByText(/optional/)).toBeNull();

    await publishNewPhoto('Sink repair');
    expect(api.createPortfolio).toHaveBeenCalledWith(expect.objectContaining({ category_id: 1 }));
  });

  it('with two services, files the photo under the one the provider picks', async () => {
    (useAuth as jest.Mock).mockReturnValue({ providerProfile: TWO_SERVICES });
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    await screen.findByText('No portfolio photos yet');

    fireEvent.press(screen.getByRole('radio', { name: 'Cleaning' }));
    await publishNewPhoto('Sink repair');

    expect(api.createPortfolio).toHaveBeenCalledWith(expect.objectContaining({ category_id: 2 }));
  });

  it('editing keeps the photo\'s own category, and shows that service picked', async () => {
    (useAuth as jest.Mock).mockReturnValue({ providerProfile: TWO_SERVICES });
    (api.myPortfolio as jest.Mock).mockResolvedValue([{ ...entry, category_id: 2 }]);
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    fireEvent.press(await screen.findByText('Edit photo details'));

    expect(screen.getByRole('radio', { name: 'Cleaning' }).props.accessibilityState.selected).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Caption'), 'New caption');
    await act(async () => fireEvent.press(screen.getByText('Save photo details')));

    expect(api.updatePortfolio).toHaveBeenCalledWith('photo', expect.objectContaining({ caption: 'New caption', category_id: 2 }));
  });

  it('editing a photo filed under a service the provider no longer lists keeps that category when saved', async () => {
    (useAuth as jest.Mock).mockReturnValue({ providerProfile: TWO_SERVICES });
    (api.myPortfolio as jest.Mock).mockResolvedValue([{ ...entry, category_id: 9 }]);
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    fireEvent.press(await screen.findByText('Edit photo details'));

    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityState.selected)).toEqual([false, false]);
    fireEvent.changeText(screen.getByLabelText('Caption'), 'New caption');
    await act(async () => fireEvent.press(screen.getByText('Save photo details')));

    expect(api.updatePortfolio).toHaveBeenCalledWith('photo', expect.objectContaining({ category_id: 9 }));
  });
});

describe('portfolio form UX and examples', () => {
  const plumber = { category_id: 1, service_categories: { name: 'Plumbing' }, approved_secondary_services: [] };
  const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ ...entry, id: `p${i}`, position: i }));

  it('shows field errors under photo and caption, and focuses the caption when only it is missing', async () => {
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    await screen.findByText('No portfolio photos yet');
    await act(async () => fireEvent.press(screen.getByText('Publish photo')));
    expect(screen.getByText('Choose a photo to publish.')).toBeTruthy();
    expect(screen.getByText('Add a caption to publish this photo.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Choose portfolio photo')));
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    await act(async () => fireEvent.press(screen.getByText('Publish photo')));
    expect(focus).toHaveBeenCalled();
    expect(api.createPortfolio).not.toHaveBeenCalled();
  });

  it('confirms Published after a save', async () => {
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    await screen.findByText('No portfolio photos yet');
    await act(async () => fireEvent.press(screen.getByText('Choose portfolio photo')));
    fireEvent.changeText(screen.getByLabelText('Caption'), 'Sink repair');
    await act(async () => fireEvent.press(screen.getByText('Publish photo')));
    expect(screen.getByText('Published')).toBeTruthy();
  });

  it('shows labelled Example cards for the service under 3 photos, and hides them at 3', async () => {
    (useAuth as jest.Mock).mockReturnValue({ providerProfile: plumber });
    (api.myPortfolio as jest.Mock).mockResolvedValue(photos(2));
    const first = render(<SPPortfolioScreen onBack={jest.fn()} />);
    expect(await screen.findByText('Show the whole sink or pipe, in good light')).toBeTruthy();
    expect(screen.getAllByText('Example').length).toBe(2);
    first.unmount();
    (api.myPortfolio as jest.Mock).mockResolvedValue(photos(3));
    render(<SPPortfolioScreen onBack={jest.fn()} />);
    await screen.findAllByText('Edit photo details');
    expect(screen.queryByTestId('portfolio-examples')).toBeNull();
  });
});
