import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import SPPortfolioScreen from '../SPPortfolioScreen';
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
    screen.getByLabelText('Portfolio caption'),
    'Sink repair',
  );
  fireEvent.changeText(screen.getByLabelText('Portfolio display order'), '3');
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
    position: 3,
    category_id: null,
  });
  await screen.findByText('Sink repair');
});
it('edits caption/order without reupload and removes only after confirmation', async () => {
  (api.myPortfolio as jest.Mock).mockResolvedValue([entry]);
  render(<SPPortfolioScreen onBack={jest.fn()} />);
  fireEvent.press(await screen.findByText('Edit photo details'));
  fireEvent.changeText(
    screen.getByLabelText('Portfolio caption'),
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
  fireEvent.changeText(screen.getByLabelText('Portfolio caption'), 'Work');
  await act(async () => fireEvent.press(screen.getByText('Publish photo')));
  expect(screen.getByText('Upload failed')).toBeTruthy();
  expect(api.createPortfolio).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Portfolio caption').props.value).toBe('Work');
});
