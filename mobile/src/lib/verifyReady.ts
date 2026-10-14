/**
 * verifyReady.ts: whether a provider has the profile details verification
 * needs. Pure, so the finish card, the Profile row and the verification screen
 * all agree. A provider needs an address (jobs near them) and a bio (what they
 * do best) before they can be sent to verify, in that order.
 */
import type { Profile, ProviderProfile } from './api';
import { addressSaved } from './verifyFlow';

type ProfileFields = Partial<Pick<Profile, 'address' | 'city'>> | null | undefined;
type ProviderFields = Partial<Pick<ProviderProfile, 'bio'>> | null | undefined;

export type MissingProfileStep = 'address' | 'bio';

function filled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** The profile steps still to do, in the order the Home setup card shows them. The address rule is the Home card's. */
export function missingProfileSteps(profile: ProfileFields, providerProfile: ProviderFields): MissingProfileStep[] {
  const missing: MissingProfileStep[] = [];
  if (!addressSaved(profile)) missing.push('address');
  if (!filled(providerProfile?.bio)) missing.push('bio');
  return missing;
}

/** True only when the provider has a service profile, an address and a bio. */
export function profileReadyToVerify(profile: ProfileFields, providerProfile: ProviderFields): boolean {
  return !!providerProfile && missingProfileSteps(profile, providerProfile).length === 0;
}
