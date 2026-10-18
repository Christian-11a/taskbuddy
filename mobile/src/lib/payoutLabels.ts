/**
 * How a payout row's status reads. The server sends `completed`, `pending` or
 * `failed`; any other value is shown as its raw text in neutral colour.
 */
export function payoutStatus(status: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (status) {
    case 'completed': return { label: 'Sent', tone: 'success' };
    case 'pending': return { label: 'Pending', tone: 'warning' };
    case 'failed': return { label: 'Failed', tone: 'danger' };
    default: return { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown', tone: 'neutral' };
  }
}

/**
 * The title shown under a payout amount. Old wallet-era rows are titled
 * "Withdrawal" (or have no title); those read as "Payout". Other titles pass through.
 */
export function payoutTitle(title: string | null | undefined): string {
  const trimmed = (title ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'withdrawal') return 'Payout';
  return title as string;
}
