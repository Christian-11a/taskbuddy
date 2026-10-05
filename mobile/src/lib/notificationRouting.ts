export type NotificationTarget =
  | { kind: 'proposals' | 'job' | 'chat' | 'dispute'; jobId: string }
  | { kind: 'services' }
  | { kind: 'none' };

/** Persisted IDs determine the destination for both in-app and push taps. */
export function resolveNotificationTarget(
  role: 'homeowner' | 'provider',
  data: { job_id?: string; application_id?: string; conversation_id?: string; request_id?: string; dispute_id?: string },
): NotificationTarget {
  if (role === 'provider' && data.request_id) return { kind: 'services' };
  const jobId = data.job_id;
  if (!jobId) return { kind: 'none' };
  if (data.conversation_id) return { kind: 'chat', jobId };
  if (data.dispute_id) return { kind: 'dispute', jobId };
  if (role === 'homeowner' && data.application_id) return { kind: 'proposals', jobId };
  return { kind: 'job', jobId };
}
