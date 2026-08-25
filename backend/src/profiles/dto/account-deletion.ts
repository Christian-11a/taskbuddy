/**
 * What stands between an account and deletion.
 *
 * Not a DTO — nothing arrives in a request body here. This is the vocabulary
 * of the 409 that `DELETE /profiles/me` answers with, kept beside the service
 * so the app and the console can name the same blockers the API does.
 */
export type DeletionBlockerCode =
  | 'wallet_balance'
  | 'pending_withdrawal'
  | 'escrow_held'
  | 'active_job'
  | 'open_dispute';

export interface DeletionBlocker {
  code: DeletionBlockerCode;
  /** Shown to the user as-is; says what to do, not just what is wrong. */
  message: string;
}

/** Job states an account cannot walk away from mid-flight. */
export const ACTIVE_JOB_STATUSES = [
  'assigned',
  'confirmed',
  'in_progress',
] as const;
