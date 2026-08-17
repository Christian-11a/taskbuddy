/**
 * pushNotifications.ts — Expo permission prompt + push-token acquisition.
 *
 * Registration is best-effort by design: a device that cannot receive pushes
 * must still be able to sign in. But "best-effort" was being implemented as a
 * bare `.catch(() => {})`, which made a *permanent misconfiguration* look
 * exactly like a user declining the prompt — silence either way. This returns
 * a described outcome instead, so the caller can log a real reason.
 *
 * The failure that actually bites: `getExpoPushTokenAsync()` needs a project
 * id, resolved from `options.projectId` → `Constants.easConfig` →
 * `expoConfig.extra.eas.projectId`. With none of the three it throws
 * `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID`. See mobile/README.md "Live chat and
 * push notifications" for what to set.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

type PushPlatform = 'ios' | 'android';

export interface ExpoPushRegistration {
  token: string;
  platform: PushPlatform;
}

export type PushRegistrationOutcome =
  /** A token was obtained and can be sent to POST /devices. */
  | { status: 'registered'; registration: ExpoPushRegistration }
  /** This platform can't do remote push at all (web). Not a fault. */
  | { status: 'unsupported'; reason: string }
  /** The user said no. Their call — never retried automatically. */
  | { status: 'denied' }
  /** The app is missing an EAS project id. Needs a config change, not a retry. */
  | { status: 'misconfigured'; reason: string }
  /** Anything else — network, Expo service, a dev client without credentials. */
  | { status: 'error'; reason: string };

/** Missing-projectId error code thrown by expo-notifications. */
const NO_PROJECT_ID = 'ERR_NOTIFICATIONS_NO_EXPERIENCE_ID';

export async function requestExpoPushRegistration(): Promise<PushRegistrationOutcome> {
  if (Platform.OS === 'web') {
    return { status: 'unsupported', reason: 'Remote push is not supported on web.' };
  }

  try {
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
    if (status !== 'granted') return { status: 'denied' };

    const { data: token } = await Notifications.getExpoPushTokenAsync();
    return {
      status: 'registered',
      registration: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    };
  } catch (e: unknown) {
    const code = (e as { code?: string } | null)?.code;
    const message = e instanceof Error ? e.message : String(e);

    if (code === NO_PROJECT_ID) {
      return {
        status: 'misconfigured',
        reason:
          'No EAS projectId — set expo.extra.eas.projectId in app.json (run `eas init`). ' +
          'Remote push also requires a development build; it does not work in Expo Go on SDK 53+.',
      };
    }
    return { status: 'error', reason: message };
  }
}
