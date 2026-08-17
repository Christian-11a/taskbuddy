import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

type PushPlatform = 'ios' | 'android' | 'web';

export interface ExpoPushRegistration {
  token: string;
  platform: PushPlatform;
}

/** Requests permission only after sign-in and returns no value when unavailable. */
export async function getExpoPushRegistration(): Promise<ExpoPushRegistration | null> {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return { token, platform };
}
