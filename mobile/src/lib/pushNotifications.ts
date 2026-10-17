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
import { isRunningInExpoGo } from 'expo';

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

  // Importing expo-notifications initializes its push-token listener. Android
  // Expo Go removed remote-push support in SDK 53, and that initialization
  // throws before the registration promise can handle the error. Keep Expo Go
  // usable for the rest of the app and load notifications only in a build
  // that includes the supported native push implementation.
  if (isRunningInExpoGo()) {
    return {
      status: 'unsupported',
      reason: 'Remote push requires a development or production build, not Expo Go.',
    };
  }

  try {
    const Notifications = await import('expo-notifications');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
      });
      // Chat has its own channel (migration 0061), so people can mute or tune
      // chat alerts in Android settings without losing job and payment ones.
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Messages',
        description: 'New chat messages from clients and providers',
        importance: Notifications.AndroidImportance.HIGH,
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

/**
 * Subscribes to the user tapping a push notification banner. Guarded the
 * same way as registration above: a static `expo-notifications` import
 * crashes Android Expo Go, so this only loads the module on a build that
 * supports it. Returns a no-op unsubscribe on web / Expo Go.
 */
export async function subscribeToNotificationTaps(
  cb: (data: Record<string, string>) => void,
): Promise<() => void> {
  if (Platform.OS === 'web' || isRunningInExpoGo()) {
    return () => {};
  }

  const Notifications = await import('expo-notifications');
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    cb(response.notification.request.content.data as Record<string, string>);
  });
  return () => subscription.remove();
}

/**
 * Calls `cb` when a chat push arrives while the app is open, so the unread
 * badges can refresh straight away. No-op on web / Expo Go.
 */
export async function subscribeToChatPushes(cb: () => void): Promise<() => void> {
  if (Platform.OS === 'web' || isRunningInExpoGo()) {
    return () => {};
  }
  const Notifications = await import('expo-notifications');
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    if (data?.type === 'chat') cb();
  });
  return () => subscription.remove();
}

/**
 * Cold-start case: the app was launched *by* tapping a notification, so the
 * live listener above (registered after mount) never fires for that tap.
 * Reads it once and clears it so it isn't replayed on a later foreground.
 */
export async function consumeLastNotificationTap(): Promise<Record<string, string> | null> {
  if (Platform.OS === 'web' || isRunningInExpoGo()) {
    return null;
  }

  const Notifications = await import('expo-notifications');
  const response = Notifications.getLastNotificationResponse();
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return null;
  }
  Notifications.clearLastNotificationResponse();
  return response.notification.request.content.data as Record<string, string>;
}
