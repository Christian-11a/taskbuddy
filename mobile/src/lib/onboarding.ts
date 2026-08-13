/**
 * onboarding.ts — "has this account seen the onboarding slides?" flag.
 *
 * The slides used to render pre-auth, so they reappeared on every cold start
 * while signed out and were never shown to a user who registered and landed
 * straight on their dashboard. They are now a post-login gate instead, shown
 * once per account.
 *
 * Keyed by profile id rather than a single global flag so two accounts sharing
 * a device (a homeowner and a provider testing together, which happens a lot
 * here) each get their own first run.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'taskbuddy.onboarded.';

const keyFor = (profileId: string) => `${KEY_PREFIX}${profileId}`;

/** True once this account has finished (or skipped) the slides. */
export async function hasCompletedOnboarding(profileId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(profileId))) === 'true';
  } catch {
    // Storage unavailable — treat as "already seen" so a failure here can
    // never trap the user on the slides instead of their dashboard.
    return true;
  }
}

/** Marks the slides done for this account. Failure is non-fatal. */
export async function markOnboardingCompleted(profileId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(profileId), 'true');
  } catch {
    /* best-effort: worst case the slides show once more */
  }
}
