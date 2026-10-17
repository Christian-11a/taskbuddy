/**
 * Where tapping a notification should take the user. Role-neutral on
 * purpose: mobile and web route clients and providers to different paths,
 * so each app maps `screen` to its own route.
 *
 * Derived on read rather than stored, because most notifications are
 * written by SQL triggers that only record `type` and `data`.
 */
export type NotificationScreen =
  | 'job'
  | 'dispute'
  | 'payouts'
  | 'verification'
  | 'skill_requests'
  | 'notifications';

export interface NotificationTarget {
  screen: NotificationScreen;
  job_id?: string;
  request_id?: string;
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export function notificationTarget(
  type: string,
  data: Record<string, unknown> | null | undefined,
): NotificationTarget {
  const jobId = str(data?.job_id);
  switch (type) {
    case 'dispute_update':
      return jobId
        ? { screen: 'dispute', job_id: jobId }
        : { screen: 'notifications' };
    case 'payment_update':
    case 'wallet_update':
      return jobId ? { screen: 'job', job_id: jobId } : { screen: 'payouts' };
    case 'verification_update':
      return { screen: 'verification' };
    case 'skill_request_update': {
      const requestId = str(data?.request_id);
      return requestId
        ? { screen: 'skill_requests', request_id: requestId }
        : { screen: 'skill_requests' };
    }
    default:
      return jobId
        ? { screen: 'job', job_id: jobId }
        : { screen: 'notifications' };
  }
}

/** The row with its `target` attached, for list and snapshot responses. */
export function withTarget<T extends { type?: unknown; data?: unknown }>(
  row: T,
): T & { target: NotificationTarget } {
  return {
    ...row,
    target: notificationTarget(
      typeof row.type === 'string' ? row.type : '',
      row.data as Record<string, unknown> | null,
    ),
  };
}
