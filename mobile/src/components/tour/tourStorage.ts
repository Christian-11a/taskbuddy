/**
 * tourStorage.ts: per-account flags for the guided tour. One says the account
 * has finished or skipped the tour; the other says the "New: take a quick
 * tour" card on Home was dismissed for good.
 *
 * Keyed by profile id, like onboarding.ts, so two accounts sharing a device
 * each get their own tour. Unlike onboarding.ts, a read that fails counts as
 * "not done": the tour is offered again rather than hidden for good.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DONE_PREFIX = 'tour.done.';
const OFFER_DISMISSED_PREFIX = 'tour.offer.dismissed.';

const doneKeyFor = (profileId: string) => `${DONE_PREFIX}${profileId}`;
const offerKeyFor = (profileId: string) => `${OFFER_DISMISSED_PREFIX}${profileId}`;

async function readFlag(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === 'true';
  } catch {
    // Storage unavailable: the flag reads as unset, so a failure never hides the tour for good.
    return false;
  }
}

async function writeFlag(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, 'true');
  } catch {
    /* best-effort: worst case the tour is offered once more */
  }
}

/** True once this account has finished or skipped the tour. */
export async function hasCompletedTour(profileId: string): Promise<boolean> {
  return readFlag(doneKeyFor(profileId));
}

/** Marks the tour done for this account. Failure is non-fatal. */
export async function markTourCompleted(profileId: string): Promise<void> {
  await writeFlag(doneKeyFor(profileId));
}

/** True once this account has dismissed the "take a quick tour" card. */
export async function hasDismissedTourOffer(profileId: string): Promise<boolean> {
  return readFlag(offerKeyFor(profileId));
}

/** Marks the "take a quick tour" card dismissed for this account. Failure is non-fatal. */
export async function markTourOfferDismissed(profileId: string): Promise<void> {
  await writeFlag(offerKeyFor(profileId));
}
