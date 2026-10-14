import type { Profile, ProviderProfile } from './api';
import { addressSaved } from './verifyFlow';

/** Where the provider's identity check stands, as the Feed reads `api.myVerification`. */
export type VerifyState = 'none' | 'pending' | 'rejected';

export type SetupStepId = 'address' | 'bio' | 'verify';
/** `done` when finished; `next` for the first unfinished step; `locked` for the rest. */
export type SetupStepState = 'done' | 'next' | 'locked';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  /** The saved value once done, otherwise the hint or the verification status. */
  subtitle: string;
  done: boolean;
  state: SetupStepState;
  /** Button text while this is the next step. The screen adds the arrow. */
  actionLabel: string;
}

type ProfileFields = Partial<Pick<Profile, 'address' | 'city'>> | null | undefined;
type ProviderFields = Partial<Pick<ProviderProfile, 'bio' | 'is_verified'>> | null | undefined;

const VERIFY_SUBTITLE: Record<VerifyState, string> = {
  none: 'ID photo + selfie · about 2 minutes',
  pending: 'Under review',
  rejected: 'Not accepted · upload new photos',
};

const VERIFY_ACTION: Record<VerifyState, string> = {
  none: 'Get verified',
  pending: 'View status',
  rejected: 'Try again',
};

function trimmed(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * The three steps a new provider finishes before jobs show in the Feed, in
 * order: address, bio, verification. A step is done when its data is saved.
 */
export function providerSetupSteps(
  profile: ProfileFields,
  providerProfile: ProviderFields,
  verifyState: VerifyState,
): SetupStep[] {
  const address = trimmed(profile?.address);
  const city = trimmed(profile?.city);
  const bio = trimmed(providerProfile?.bio);
  const verified = providerProfile?.is_verified === true;
  const addressDone = addressSaved(profile);

  const steps: Omit<SetupStep, 'state'>[] = [
    {
      id: 'address',
      title: 'Add your address',
      done: addressDone,
      subtitle: addressDone ? address || city : 'House number and street, used to show jobs near you',
      actionLabel: 'Add your address',
    },
    {
      id: 'bio',
      title: 'Add a short bio',
      done: bio !== '',
      subtitle: bio !== '' ? bio : 'Tell clients what you do best',
      actionLabel: 'Add a short bio',
    },
    {
      id: 'verify',
      title: 'Get verified',
      done: verified,
      subtitle: verified ? 'Verified' : VERIFY_SUBTITLE[verifyState],
      actionLabel: VERIFY_ACTION[verifyState],
    },
  ];

  let nextTaken = false;
  return steps.map((step) => {
    if (step.done) return { ...step, state: 'done' };
    const state: SetupStepState = nextTaken ? 'locked' : 'next';
    nextTaken = true;
    return { ...step, state };
  });
}

/** How many of the setup steps are finished, out of how many there are. */
export function setupProgress(steps: readonly SetupStep[]): { done: number; total: number } {
  return { done: steps.filter((step) => step.done).length, total: steps.length };
}

/** The step the Feed's button runs: the first one not finished yet. */
export function nextSetupStep(steps: readonly SetupStep[]): SetupStep | undefined {
  return steps.find((step) => step.state === 'next');
}
