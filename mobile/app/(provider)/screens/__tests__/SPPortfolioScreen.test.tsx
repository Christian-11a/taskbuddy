import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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
jest.mock('../../../../src/lib/api', () => ({
  api: {
    myPortfolio: jest.fn(),
    categories: jest.fn(),
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
  (api.myPortfolio as jest.Mock).mockResolvedValue([]);
  (api.categories as jest.Mock).mockResolvedValue([]);
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
it('uploads an owned image, publishes details and refreshes the saved gallery', async () => {
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet.');
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
  await screen.findByText('No portfolio photos yet.');
});
it('keeps the form on upload failure and never publishes a missing upload', async () => {
  (api.uploadImage as jest.Mock).mockRejectedValue(new Error('Upload failed'));
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet.');
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
  await screen.findByText('No portfolio photos yet.');
  expect(screen.getByText('Up to 20 photos, 10 MB each (JPEG, PNG or WebP). Signed-in clients can see them.')).toBeTruthy();
  expect(screen.getByText('Your own work only')).toBeTruthy();
  expect(screen.getByText('No client faces or house numbers')).toBeTruthy();
  expect(screen.getByText('Good light')).toBeTruthy();
  expect(screen.queryByLabelText('Portfolio display order')).toBeNull();
  expect(screen.queryByText(/Display order/)).toBeNull();
});

it('caps the caption at 400 characters', async () => {
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet.');
  expect(screen.getByLabelText('Caption').props.maxLength).toBe(400);
});

it('counts the caption as it is typed, out of 400', async () => {
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  await screen.findByText('No portfolio photos yet.');
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

  it('sends the caption cleaned: trimmed, with the extra blank lines inside it closed up', () => {
    expect(portfolioDetails({ caption: '  Sink repair\n\n\n\nDone.  ', categoryId: 1, position: 0 })).toEqual({
      caption: 'Sink repair\n\nDone.',
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
  await screen.findByText('No portfolio photos yet.');
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
  await screen.findByText('No portfolio photos yet.');
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
