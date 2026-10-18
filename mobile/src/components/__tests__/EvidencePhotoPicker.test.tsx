import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import EvidencePhotoPicker, { EVIDENCE_PHOTO_MAX_BYTES } from '../EvidencePhotoPicker';
import { requestAppPermission } from '../../lib/permissions';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: {
    Automatic: 'automatic',
    Compatible: 'compatible',
    Current: 'current',
  },
}));
jest.mock('../../lib/permissions', () => ({ requestAppPermission: jest.fn() }));

const picked = (uri: string, extra: Record<string, unknown> = {}) => ({ uri, ...extra });
const result = (...assets: unknown[]) => ({ canceled: false, assets });

const openMenu = () => fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));

const renderPicker = (overrides: Partial<React.ComponentProps<typeof EvidencePhotoPicker>> = {}) => {
  const onChange = jest.fn();
  const props = { photos: [] as string[], onChange, max: 4, label: 'Photos', ...overrides };
  const utils = render(<EvidencePhotoPicker {...props} />);
  return { onChange, utils, props };
};

beforeEach(() => {
  jest.clearAllMocks();
  (requestAppPermission as jest.Mock).mockResolvedValue(true);
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue(result(picked('file:///cache/camera.jpg')));
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue(result(picked('file:///cache/library.jpg')));
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('EvidencePhotoPicker', () => {
  it('shows a + tile, hides the two options until it is tapped, and shows the helper and count', () => {
    renderPicker({ min: 1 });

    expect(screen.getByRole('button', { name: 'Add photo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
    expect(screen.getByText('Add 1 to 4 photos')).toBeTruthy();
    expect(screen.getByText('0 / 4')).toBeTruthy();

    openMenu();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeTruthy();
  });

  it('Take photo asks for camera permission, launches the camera at quality 0.8 and adds the photo', async () => {
    const { onChange } = renderPicker({ photos: ['file:///a.jpg'] });

    openMenu();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(['file:///a.jpg', 'file:///cache/camera.jpg'])
    );
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.8 });
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(requestAppPermission).not.toHaveBeenCalled();
  });

  it('Choose from gallery keeps the library options, asks for JPEG-compatible assets and adds the picks', async () => {
    const { onChange } = renderPicker({ photos: ['file:///a.jpg'], max: 4 });

    openMenu();

    fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(['file:///a.jpg', 'file:///cache/library.jpg'])
    );
    expect(requestAppPermission).toHaveBeenCalledWith('gallery');
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 0.8,
      preferredAssetRepresentationMode: 'compatible',
      allowsMultipleSelection: true,
      selectionLimit: 3,
    });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('a cancelled camera or gallery pick adds nothing', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const { onChange } = renderPicker();

    openMenu();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    openMenu();
    fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));

    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a refused camera permission shows the message with Open settings and opens nothing', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
    const { onChange } = renderPicker();

    openMenu();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));

    expect(await screen.findByText('Camera access is off.')).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('link', { name: 'Open settings' }));
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it('after a refused camera permission the gallery still works', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    const { onChange } = renderPicker();

    openMenu();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    expect(await screen.findByText('Camera access is off.')).toBeTruthy();

    openMenu();

    fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(['file:///cache/library.jpg'])
    );
    expect(screen.queryByText('Camera access is off.')).toBeNull();
  });

  it('has no + tile once max is reached, and remove still frees a slot', () => {
    const { onChange } = renderPicker({ photos: ['file:///a.jpg', 'file:///b.jpg'], max: 2 });

    expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull();
    expect(screen.getByText('2 / 2')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Photo 1, remove' }));
    expect(onChange).toHaveBeenCalledWith(['file:///b.jpg']);
  });

  it('never adds more than max, even when the picker returns extra photos', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue(
      result(picked('file:///1.jpg'), picked('file:///2.jpg'), picked('file:///3.jpg'))
    );
    const { onChange } = renderPicker({ photos: ['file:///a.jpg'], max: 2 });

    openMenu();

    fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(['file:///a.jpg', 'file:///1.jpg']);
  });

  it('skips photos over 10 MB and says so', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue(
      result(picked('file:///big.jpg', { fileSize: EVIDENCE_PHOTO_MAX_BYTES + 1 }), picked('file:///ok.jpg', { fileSize: 1000 }))
    );
    const { onChange } = renderPicker();

    openMenu();

    fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));

    expect(await screen.findByText('Each photo must be 10 MB or smaller.')).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith(['file:///ok.jpg']);
  });

  it('disables the + tile and remove buttons while the caller is busy', () => {
    renderPicker({ disabled: true, photos: ['file:///a.jpg'] });

    expect(screen.getByRole('button', { name: 'Add photo' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByRole('button', { name: 'Photo 1, remove' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
  });
});
