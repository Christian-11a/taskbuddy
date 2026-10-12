import { peso } from './format';

/**
 * Reason values sent to the backend (`raiseDispute`), in the order the form shows them.
 * The values are stored with the case, so they must not be renamed.
 */
export const REPORT_REASONS = [
  'Payment or cancellation issue',
  'Work not completed',
  'Work quality issue',
  'Participant did not arrive',
  'Conduct issue',
  'Other',
] as const;

/** The words shown for a reason. Only the label changes; the value sent is the one in REPORT_REASONS. */
export function reasonLabel(reason: string, isProvider: boolean): string {
  if (reason === 'Other') return 'Something else';
  if (reason === 'Participant did not arrive') return isProvider ? 'Client did not arrive' : 'Provider did not arrive';
  return reason;
}

type AssignedJob = { assigned_provider?: { full_name: string } | null };

/** "Plumbing: Fix leaking faucet · TaskBuddyProvider" for the homeowner, the job alone for the provider. Null until the job loads. */
export function reportChipText(job: (AssignedJob & { title: string }) | null | undefined, isProvider: boolean): string | null {
  if (!job) return null;
  const provider = isProvider ? null : job.assigned_provider?.full_name;
  return [job.title, provider].filter(Boolean).join(' · ');
}

/** Who the report is about, as the other party: the provider for the homeowner, the client for the provider. */
export function reportOtherParty(job: AssignedJob | null | undefined, isProvider: boolean): string {
  if (isProvider) return 'The client';
  return job?.assigned_provider?.full_name?.trim() || 'The provider';
}

/** Bullets for the "Send this report?" confirm, one line each. The payment line appears only while money is held. */
export function reportConfirmMessage(input: { held: number | null; otherParty: string }): string {
  const lines = [
    input.held === null ? null : `• The ${peso(input.held)} payment is paused until an admin decides.`,
    `• ${input.otherParty} is told and can add their side.`,
    '• You can add more details or photos later.',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}
