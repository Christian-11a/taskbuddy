import type { JobRowTone } from '../components/ui/JobRow';
import type { Job } from './api';
import { jobStatusMeta } from './format';

/**
 * The status line of a job row, shared by Home and My Jobs.
 * `pendingCount` is the pending proposals on the job; leave it undefined while
 * that count is still loading (an open job then reads as waiting).
 */
export function jobRowStatus(job: Job, pendingCount?: number): { tone: JobRowTone; meta: string } {
  if (job.display_status === 'disputed') return { tone: 'needsYou', meta: 'Disputed' };
  switch (job.status) {
    case 'open':
    case 'recommending': {
      const pending = pendingCount ?? 0;
      if (pending > 0) {
        return { tone: 'needsYou', meta: `${pending} ${pending === 1 ? 'proposal' : 'proposals'} to review` };
      }
      return { tone: 'waiting', meta: 'Open · waiting for proposals' };
    }
    case 'assigned':
    case 'confirmed':
      return { tone: 'booked', meta: 'Confirmed' };
    case 'in_progress':
      return { tone: 'booked', meta: 'In progress' };
    case 'completed':
      return { tone: 'done', meta: 'Completed' };
    case 'cancelled':
      return { tone: 'done', meta: 'Cancelled' };
    case 'expired':
      return { tone: 'done', meta: 'Expired' };
    default:
      return { tone: 'done', meta: jobStatusMeta(job.status).label };
  }
}
