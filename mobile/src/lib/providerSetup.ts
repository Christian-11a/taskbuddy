import type { CertificateState, Profile, ProviderProfile } from './api';
import { addressSaved } from './verifyFlow';

/** Where the provider's identity check stands, as the Feed reads `api.myVerification`. */
export type VerifyState = 'none' | 'pending' | 'rejected';

export type SetupStepId = 'address' | 'bio' | 'verify' | 'payout';
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
  /** Get verified only: true when the next action is the certificate, so the tap opens the certificate screen. */
  opensCertificate?: boolean;
}

type ProfileFields = Partial<Pick<Profile, 'address' | 'city'>> | null | undefined;
type ProviderFields = Partial<Pick<ProviderProfile, 'bio' | 'is_verified'>> | null | undefined;

function trimmed(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export interface SetupExtras {
  /** The primary service's certificate (`me.certificate`, or derived from `myCredentials()`). Missing counts as not done. */
  certificate?: CertificateState | 'unknown';
  /** True when the ID check is approved (`me.identity === 'approved'`). Overrides `is_verified` for the ID step. */
  identityApproved?: boolean;
}

/**
 * The Get verified step's copy while it is not done. The ID check comes first:
 * until it is approved the step follows the request status, and after that it
 * names the certificate that is still missing or needs attention.
 */
function verifyCopy(
  verifyState: VerifyState,
  identityApproved: boolean,
  certificate: CertificateState | 'unknown',
): Pick<SetupStep, 'subtitle' | 'actionLabel' | 'opensCertificate'> {
  if (!identityApproved) {
    if (verifyState === 'pending') return { subtitle: 'ID under review', actionLabel: 'View status', opensCertificate: false };
    if (verifyState === 'rejected') return { subtitle: 'Not accepted · upload new photos', actionLabel: 'Try again', opensCertificate: false };
    if (certificate === 'none' || certificate === 'unknown') {
      return { subtitle: 'ID photo, selfie and certificate · about 5 minutes', actionLabel: 'Get verified', opensCertificate: false };
    }
    return { subtitle: 'ID photo and selfie needed', actionLabel: 'Get verified', opensCertificate: false };
  }
  switch (certificate) {
    case 'pending':
      return { subtitle: 'ID approved · certificate under review', actionLabel: 'View status', opensCertificate: true };
    case 'rejected':
      return { subtitle: 'Certificate not accepted · upload a new one', actionLabel: 'Upload again', opensCertificate: true };
    case 'expired':
      return { subtitle: 'Certificate expired · upload a renewed one', actionLabel: 'Renew certificate', opensCertificate: true };
    default:
      return { subtitle: 'ID approved · certificate needed', actionLabel: 'Upload your certificate', opensCertificate: true };
  }
}

/**
 * The steps a new provider finishes, in order: address, bio, Get verified (the ID
 * check and the certificate for the main service, one step), then a payout account
 * (proposals need one). A step is done when its data is saved. `payoutLinked` is
 * true once `GET /payouts/account` returns an account.
 */
export function providerSetupSteps(
  profile: ProfileFields,
  providerProfile: ProviderFields,
  verifyState: VerifyState,
  payoutLinked: boolean | null = null,
  extras: SetupExtras = {},
): SetupStep[] {
  const address = trimmed(profile?.address);
  const city = trimmed(profile?.city);
  const bio = trimmed(providerProfile?.bio);
  const certificate = extras.certificate ?? 'none';
  const identityApproved = extras.identityApproved ?? providerProfile?.is_verified === true;
  // is_verified is only set once the ID and the main service's certificate are both approved, so it counts as done on its own.
  const verifyDone = providerProfile?.is_verified === true || (identityApproved && certificate === 'approved');
  const addressDone = addressSaved(profile);

  const verify = verifyDone
    ? { subtitle: 'Verified', actionLabel: 'Get verified', opensCertificate: false }
    : verifyCopy(verifyState, identityApproved, certificate);

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
      done: verifyDone,
      ...verify,
    },
    {
      id: 'payout',
      title: 'Link payout account',
      done: payoutLinked === true,
      subtitle: payoutLinked === true ? 'Linked' : 'GCash, Maya or bank account · needed to send proposals',
      actionLabel: 'Link payout account',
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

/** Where "You're verified!" leads: link a payout account when none is linked; otherwise (or unknown) the feed. */
export function verifiedNextScreen(linked: boolean | undefined): 'Payout Account' | 'Dashboard' {
  return linked === false ? 'Payout Account' : 'Dashboard';
}
