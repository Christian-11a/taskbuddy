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

  it('sends display order 0 for a new photo and keeps the stored order on edit', () => {
    expect(portfolioDetails({ caption: '  Sink repair  ', categoryId: null })).toEqual({
      caption: 'Sink repair',
      position: 0,
      category_id: null,
    });
    expect(portfolioDetails({ caption: 'New caption', categoryId: 3, storedPosition: 4 })).toEqual({
      caption: 'New caption',
      position: 4,
      category_id: 3,
    });
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
