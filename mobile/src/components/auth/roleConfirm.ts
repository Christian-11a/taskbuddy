/**
 * Logic for the Google role confirm sheet: the words shown before the role is
 * saved, and which action "Yes" runs. Nothing here saves on its own; the
 * caller passes in today's save handler and today's provider navigation.
 */

export type GoogleRole = 'homeowner' | 'provider';

export function roleConfirmCopy(role: GoogleRole, email?: string | null) {
  const isProvider = role === 'provider';
  const purpose = isProvider ? 'finding work' : 'hiring';
  const trimmed = email?.trim();
  const account = trimmed
    ? `Your Google account ${trimmed} will be set up for ${purpose}.`
    : `Your Google account will be set up for ${purpose}.`;
  return {
    title: isProvider ? 'Sign up as a service provider?' : 'Sign up as a client?',
    body: `${account} This can't be changed later.`,
    confirmLabel: isProvider ? 'Yes, I want to work' : 'Yes, I want to hire',
    chooseAgainLabel: 'Choose again',
  };
}

/**
 * Runs what "Yes" means for the confirmed role. A homeowner is saved right
 * away; a provider only moves on to the provider details form, which saves
 * later, as it always has.
 */
export async function confirmRoleChoice(
  role: GoogleRole,
  actions: { saveHomeowner: () => Promise<void>; continueToProvider: () => void },
): Promise<void> {
  if (role === 'provider') {
    actions.continueToProvider();
    return;
  }
  await actions.saveHomeowner();
}
