export type NotificationTarget =
  | { kind: 'proposals' | 'job' | 'chat' | 'dispute'; jobId: string }
  | { kind: 'services' | 'payouts' | 'verification' }
  | { kind: 'none' };

type Role = 'homeowner' | 'provider';

interface RoutingData {
  job_id?: string;
  application_id?: string;
  conversation_id?: string;
  request_id?: string;
  dispute_id?: string;
}

/** The backend's `target` (see backend notifications/notification-target.ts). */
interface ServerTarget {
  screen?: unknown;
  job_id?: unknown;
}

/** A push carries `target` as an object; tolerate a JSON string too. */
function readServerTarget(raw: unknown): ServerTarget | null {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' ? (value as ServerTarget) : null;
}

function resolveFromServerTarget(role: Role, target: ServerTarget): NotificationTarget {
  const jobId = typeof target.job_id === 'string' && target.job_id !== '' ? target.job_id : undefined;
  switch (target.screen) {
    case 'job':
      return jobId ? { kind: 'job', jobId } : { kind: 'none' };
    case 'dispute':
      if (!jobId) return { kind: 'none' };
      // A provider sees the case in its section of the job detail.
      return role === 'homeowner' ? { kind: 'dispute', jobId } : { kind: 'job', jobId };
    case 'payouts':
      if (role === 'provider') return { kind: 'payouts' };
      return jobId ? { kind: 'job', jobId } : { kind: 'none' };
    case 'verification':
      return role === 'provider' ? { kind: 'verification' } : { kind: 'none' };
    case 'skill_requests':
      return role === 'provider' ? { kind: 'services' } : { kind: 'none' };
    default:
      // 'notifications' and any screen this app does not know.
      return { kind: 'none' };
  }
}

/**
 * Where a tap goes. Reads the backend's `target` first; rows and pushes from
 * before it existed fall back to the persisted IDs in `data`.
 */
export function resolveNotificationTarget(
  role: Role,
  data: RoutingData,
  serverTarget?: unknown,
): NotificationTarget {
  const target = readServerTarget(serverTarget);
  const isChat = Boolean(data.conversation_id && data.job_id);
  // A homeowner's application push opens the job's proposals when the server target is absent or 'job'.
  if (!isChat && role === 'homeowner' && data.application_id && (!target || target.screen === 'job')) {
    const serverJobId = target && typeof target.job_id === 'string' && target.job_id !== '' ? target.job_id : undefined;
    const jobId = data.job_id || serverJobId;
    if (jobId) return { kind: 'proposals', jobId };
  }
  // Chat is not in Notifications; a Messages push keeps its own route.
  if (!isChat && target) return resolveFromServerTarget(role, target);

  if (role === 'provider' && data.request_id) return { kind: 'services' };
  const jobId = data.job_id;
  if (!jobId) return { kind: 'none' };
  if (data.conversation_id) return { kind: 'chat', jobId };
  if (data.dispute_id) return { kind: 'dispute', jobId };
  if (role === 'homeowner' && data.application_id) return { kind: 'proposals', jobId };
  return { kind: 'job', jobId };
}
