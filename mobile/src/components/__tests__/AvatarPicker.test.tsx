import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import AvatarPicker from '../AvatarPicker';
import { requestAppPermission } from '../../lib/permissions';
import { api } from '../../lib/api';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('../../lib/permissions', () => ({ requestAppPermission: jest.fn() }));
jest.mock('../../lib/api', () => ({
  api: { uploadImage: jest.fn(), updateProfile: jest.fn() },
}));
const mockRefreshProfile = jest.fn();
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ profile: { avatar_url: null }, refreshProfile: mockRefreshProfile }),
}));

const pickedPhoto = (uri = 'file:///cache/new.jpg') => ({ canceled: false, assets: [{ uri }] });
const PICKER_OPTIONS = expect.objectContaining({
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
});

beforeEach(() => {
  jest.clearAllMocks();
  (requestAppPermission as jest.Mock).mockResolvedValue(true);
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue(pickedPhoto());
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue(pickedPhoto());
  (api.uploadImage as jest.Mock).mockResolvedValue('avatars/user/new.jpg');
  (api.updateProfile as jest.Mock).mockResolvedValue({});
});

const openSheet = () => fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

describe('AvatarPicker — the profile photo sheet', () => {
  it('opens a sheet with Take a photo and Choose from gallery, and no remove option', () => {
    render(<AvatarPicker name="TaskBuddy" />);

    openSheet();

    expect(screen.getByText('Profile photo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeTruthy();
    expect(screen.queryByText('Remove photo')).toBeNull();
  });

  it('Choose from gallery asks for the photo library, uploads the picked image and saves its path', async () => {
    render(<AvatarPicker name="TaskBuddy" />);
    openSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ avatar_url: 'avatars/user/new.jpg' }));
    expect(requestAppPermission).toHaveBeenCalledWith('gallery');
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(PICKER_OPTIONS);
    expect(api.uploadImage).toHaveBeenCalledWith('avatars', 'file:///cache/new.jpg');
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
  });

  it('Take a photo asks for the camera and saves the photo the same way', async () => {
    render(<AvatarPicker name="TaskBuddy" />);
    openSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ avatar_url: 'avatars/user/new.jpg' }));
    expect(requestAppPermission).toHaveBeenCalledWith('camera');
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(PICKER_OPTIONS);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(api.uploadImage).toHaveBeenCalledWith('avatars', 'file:///cache/new.jpg');
  });

  it('a camera permission that is refused opens nothing and saves nothing', async () => {
    (requestAppPermission as jest.Mock).mockResolvedValue(false);
    render(<AvatarPicker name="TaskBuddy" />);
    openSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));

    await waitFor(() => expect(requestAppPermission).toHaveBeenCalledWith('camera'));
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('a cancelled pick changes nothing', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    render(<AvatarPicker name="TaskBuddy" />);
    openSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));

    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('shows the upload error under the photo', async () => {
    (api.uploadImage as jest.Mock).mockRejectedValue(new Error('Could not upload the image. Try again.'));
    render(<AvatarPicker name="TaskBuddy" />);
    openSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));

    expect(await screen.findByText('Could not upload the image. Try again.')).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('Cancel closes the sheet without touching the photo', () => {
    render(<AvatarPicker name="TaskBuddy" />);
    openSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Profile photo')).toBeNull();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});
