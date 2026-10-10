/**
 * Pure rules for the provider verification screen: which view is showing,
 * which wizard step is on screen, and what the checklists say. Nothing here
 * calls the API; the screen keeps every upload, session and submit call.
 */

/**
 * The IDs we accept. `value` is sent as `document_type`; it must not change.
 * `side` is the photo the provider takes, shown under each ID in the list.
 */
export const VERIFY_ID_TYPES = [
  { value: 'philsys', label: 'PhilSys National ID', side: 'Photo of the front' },
  { value: 'drivers_license', label: "Driver's licence", side: 'Photo of the front' },
  { value: 'umid', label: 'UMID', side: 'Photo of the front' },
  { value: 'passport', label: 'Passport', side: 'Photo page' },
  { value: 'postal_id', label: 'Postal ID', side: 'Photo of the front' },
] as const;

export type VerifyDocumentType = (typeof VERIFY_ID_TYPES)[number]['value'];

export type VerifyStatus = 'pending' | 'approved' | 'rejected';

export type VerifyView = 'loading' | 'intro' | 'wizard' | 'sending' | 'pending' | 'rejected' | 'approved';

/**
 * Which view the screen shows. The sending view wins while submitting. A
 * pending review or an approval always wins over the wizard. A rejection
 * shows first and opens the wizard only after "Try again".
 */
export function pickVerifyView(input: {
  loading: boolean;
  status: VerifyStatus | null;
  submitting: boolean;
  started: boolean;
}): VerifyView {
  if (input.submitting) return 'sending';
  if (input.status === 'approved') return 'approved';
  if (input.status === 'pending') return 'pending';
  // The loader is for the first load only; a reload keeps what is on screen.
  if (input.loading && input.status === null) return 'loading';
  if (input.status === 'rejected' && !input.started) return 'rejected';
  return input.started ? 'wizard' : 'intro';
}

/** Where the provider is inside step 1: picking the ID, then the photo tips, then the photo check. */
export type IdPhase = 'choose' | 'tips' | 'check';

export const WIZARD_LABELS = ['Your ID', 'ID photo', 'Selfie', 'Review'] as const;

/**
 * The four numbered steps the Figma flow shows. The state machine has three
 * steps; step 1 covers "Your ID" and "ID photo", so the ID phase picks which.
 */
export function wizardProgress(
  step: number,
  idPhase: IdPhase,
): { step: number; total: number; label: string } {
  const current = step <= 1 ? (idPhase === 'choose' ? 1 : 2) : step === 2 ? 3 : 4;
  return { step: current, total: WIZARD_LABELS.length, label: WIZARD_LABELS[current - 1] };
}

/**
 * The two profile items the verification depends on. "Service picked" is
 * ticked when a provider profile exists, because the API needs one.
 */
export function profileChecks(
  providerProfile: { bio?: string | null } | null | undefined,
): { label: string; done: boolean }[] {
  return [
    { label: 'Service picked', done: providerProfile != null },
    { label: 'Bio added', done: (providerProfile?.bio ?? '').trim() !== '' },
  ];
}
