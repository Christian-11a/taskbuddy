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

/** The camera button names the side of the ID it photographs. */
export function takePhotoLabel(documentType: VerifyDocumentType | null): string {
  return documentType === 'passport' ? 'Take photo of the photo page' : 'Take photo of the front';
}

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
  /** True from a finished submission until the reload brings the new status. */
  settling?: boolean;
}): VerifyView {
  if (input.submitting) return 'sending';
  // The old status is still loaded at this point; show the loader rather than a stale screen.
  if (input.settling) return 'loading';
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

/**
 * The stage text the screen's upload code sets while it works. The sending
 * checklist reads these exact strings, so they must stay in step with the screen.
 */
export const UPLOAD_STAGE = 'Uploading your documents…';
export const SESSION_STAGE = 'Opening the automated check…';

export type ChecklistStatus = 'done' | 'active' | 'pending';

export type SendingRow = {
  key: 'id' | 'selfie' | 'check';
  label: string;
  status: ChecklistStatus;
};

/**
 * The sending checklist, read from the stage the upload code reports. The two
 * photos upload together, so they share one state. Nothing is ticked before the
 * stage says it happened, and a stage the screen does not know ticks nothing.
 */
export function sendingRows(stage: string | null): SendingRow[] {
  const uploading = stage === UPLOAD_STAGE;
  const checking = stage === SESSION_STAGE;
  const photosStatus: ChecklistStatus = checking ? 'done' : uploading ? 'active' : 'pending';
  return [
    {
      key: 'id',
      label: checking ? 'ID photo uploaded' : uploading ? 'Uploading ID photo' : 'ID photo',
      status: photosStatus,
    },
    {
      key: 'selfie',
      label: checking ? 'Selfie uploaded' : uploading ? 'Uploading selfie' : 'Selfie',
      status: photosStatus,
    },
    { key: 'check', label: 'Starting the secure check', status: checking ? 'active' : 'pending' },
  ];
}

export type TimelineState = 'done' | 'current' | 'upcoming';

export type TimelineRow = {
  key: 'sent' | 'check' | 'review' | 'apply';
  title: string;
  detail: string;
  state: TimelineState;
};

/**
 * The timeline for a pending review. The automated check is shown as running,
 * not finished: the status alone cannot say that the check has ended, and an
 * admin may still review the documents if the check cannot decide.
 */
export function pendingRows(input: {
  method: 'manual' | 'stripe_identity';
  fellBackToManual: boolean;
}): TimelineRow[] {
  const automated = input.method === 'stripe_identity' && !input.fellBackToManual;
  const rows: TimelineRow[] = [
    { key: 'sent', title: 'Documents sent', detail: 'Your ID and selfie reached TaskBuddy.', state: 'done' },
  ];
  if (automated) {
    rows.push({
      key: 'check',
      title: 'Automated check',
      detail: 'Running. This usually takes a couple of minutes.',
      state: 'current',
    });
    rows.push({
      key: 'review',
      title: 'Admin review',
      detail: 'Only if the automated check cannot decide.',
      state: 'upcoming',
    });
  } else {
    rows.push({
      key: 'review',
      title: 'Admin review',
      detail: 'An admin is reviewing your documents now.',
      state: 'current',
    });
  }
  rows.push({ key: 'apply', title: 'You can apply to jobs', detail: 'After you are approved.', state: 'upcoming' });
  return rows;
}

/** The admin's reason, as written. Null when there is none, so the screen does not invent one. */
export function rejectionNote(reason: string | null | undefined): string | null {
  const text = (reason ?? '').trim();
  return text === '' ? null : `Admin note: ${text}`;
}
