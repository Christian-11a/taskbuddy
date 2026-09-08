import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export type AppPermission = 'camera' | 'gallery' | 'location';

const labels: Record<AppPermission, string> = {
  camera: 'camera',
  gallery: 'photo library',
  location: 'location',
};

export async function requestAppPermission(
  kind: AppPermission
): Promise<boolean> {
  try {
    if (kind === 'camera') {
      const permission = await ImagePicker.getCameraPermissionsAsync();

      if (permission.granted) {
        return true;
      }

      if (!permission.canAskAgain) {
        showSettingsAlert(kind);
        return false;
      }

      const result = await ImagePicker.requestCameraPermissionsAsync();

      if (result.granted) {
        return true;
      }

      if (!result.canAskAgain) {
        showSettingsAlert(kind);
      }

      return false;
    }

    if (kind === 'gallery') {
      const permission =
        await ImagePicker.getMediaLibraryPermissionsAsync();

      if (
        permission.granted ||
        permission.accessPrivileges === 'limited'
      ) {
        return true;
      }

      if (!permission.canAskAgain) {
        showSettingsAlert(kind);
        return false;
      }

      const result =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (
        result.granted ||
        result.accessPrivileges === 'limited'
      ) {
        return true;
      }

      if (!result.canAskAgain) {
        showSettingsAlert(kind);
      }

      return false;
    }

    if (kind === 'location') {
      const permission = await Location.getForegroundPermissionsAsync();

      if (permission.granted) {
        return true;
      }

      if (!permission.canAskAgain) {
        showSettingsAlert(kind);
        return false;
      }

      const result =
        await Location.requestForegroundPermissionsAsync();

      if (result.granted) {
        return true;
      }

      if (!result.canAskAgain) {
        showSettingsAlert(kind);
      }

      return false;
    }

    return false;
  } catch (error) {
    console.error(`Failed to request ${kind} permission:`, error);
    return false;
  }
}

function showSettingsAlert(kind: AppPermission): void {
  Alert.alert(
    `${labels[kind]} access required`,
    `TaskBuddy needs ${labels[kind]} access for this feature. You can allow it in Settings.`,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Open Settings',
        onPress: () => void Linking.openSettings(),
      },
    ]
  );
}