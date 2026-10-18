import type { Dispute, Job, JobTask } from './api';
import { peso, plural, timeOfDay } from './format';

/**
 * What a job's detail screen shows: the status card, the progress step, one
 * main button, an optional text link and the ⋮ menu. Pure, so the screen only
 * renders the result.
 *
 * This decides what is shown, never what is allowed. Every permission below is
 * derived from the same conditions the screen used before (canCancel,
 * canDispute, canComplete, canReview, canFindProviders).
 */

export type StatusCardTone = 'attention' | 'booked' | 'action' | 'done' | 'closed';
export type ProgressStep = 'posted' | 'hired' | 'working' | 'done' | 'cancelled';

export type Action =
  | { kind: 'reviewProposals'; count: number }
  | { kind: 'findProviders' }
  | { kind: 'viewOffers' }
  | { kind: 'message'; name: string }
  | { kind: 'confirmDone' }
  | { kind: 'reportProblem' }
  | { kind: 'viewCase' }
  | { kind: 'leaveReview' }
  | { kind: 'postAgain'; categoryId: number }
  | { kind: 'cancelJob' }
  // provider
  | { kind: 'sendProposal' }
  | { kind: 'getVerified' }
  | { kind: 'withdrawProposal' }
  | { kind: 'findJobs' }
  | { kind: 'startJob' }
  | { kind: 'declineBooking' }
  | { kind: 'viewWallet' };

export type JobView = {
  card: { tone: StatusCardTone; overline: string; title: string; body?: string };
  step: ProgressStep | null;
  main: Action | null;
  link: Action | null;
  menu: Action[];
  /** Shown above the card while a complaint is open; the money actions are hidden then. */
  banner?: { text: string; action: Action };
};

export const DISPUTE_BANNER_TEXT = 'A complaint is open. An admin is reviewing it.';

const DISPUTE_HIDDEN: readonly Action['kind'][] = ['confirmDone', 'cancelJob', 'declineBooking', 'startJob'];

/**
 * While a complaint is open (display_status 'disputed'): no complete, cancel, decline or start, a banner to the case,
 * and the status card turns to the amber attention tone so it agrees with the banner. Shared by both views.
 */
export function withDisputeBanner<V extends Pick<JobView, 'main' | 'link' | 'menu' | 'card'>>(
  view: V,
  job: Pick<Job, 'display_status'>,
  fallbackMain: Action | null = null,
): V & { banner?: { text: string; action: Action } } {
  if (job.display_status !== 'disputed') return view;
  const hidden = (action: Action | null) => !!action && DISPUTE_HIDDEN.includes(action.kind);
  return {
    ...view,
    card: { ...view.card, tone: 'attention', overline: 'COMPLAINT OPEN' },
    main: hidden(view.main) ? fallbackMain : view.main,
    link: hidden(view.link) ? null : view.link,
    menu: view.menu.filter((action) => !hidden(action)),
    banner: { text: DISPUTE_BANNER_TEXT, action: { kind: 'viewCase' } },
  };
}

/**
 * Whether the task list shows checkboxes. Before the work starts it is a plain list of what the job includes.
 * Checkboxes show from in_progress (the provider ticks them) and on a completed job (ticked, with proof photos).
 * A cancelled job keeps the ticks it had, so work already done is still shown.
 */
export function showsChecklist(status: Job['status'] | null | undefined, tasks: readonly JobTask[]): boolean {
  if (status === 'in_progress' || status === 'completed') return true;
  return status === 'cancelled' && tasks.some((task) => task.is_done);
}

export type HomeownerJobInput = {
  job: Job;
  dispute: Dispute | null;
  /**
   * Proposals still waiting for the homeowner's decision. 0 while the lookup is running;
   * null when it failed, so the count is unknown and the offers are offered without a number.
   */
  pendingCount: number | null;
  tasks: readonly JobTask[];
  /** The hired provider, or null when none is assigned or the lookup failed. */
  provider: { profiles?: { full_name: string } | null } | null;
  /** Current time in ms. Kept for callers; the view no longer depends on it. */
  now: number;
};

/** The backend expires an unassigned job this long after it was posted (recommendations scheduler). */
const EXPIRY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES: readonly string[] = ['open', 'recommending'];
const CANCELLABLE_STATUSES: readonly string[] = ['open', 'recommending', 'assigned', 'confirmed', 'in_progress'];
const DISPUTABLE_STATUSES: readonly string[] = ['assigned', 'confirmed', 'in_progress', 'cancelled'];
const MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const WEEKDAY_MONTH_DAY: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };

export function homeownerJobView(input: HomeownerJobInput): JobView {
  const view = baseHomeownerJobView(input);
  return withDisputeBanner(view, input.job, { kind: 'message', name: providerName(input.provider) ?? 'your provider' });
}

function baseHomeownerJobView(input: HomeownerJobInput): JobView {
  const { job, dispute, pendingCount, tasks, provider } = input;
  const hired = !!job.assigned_provider_id;
  const everyTaskDone = tasks.every((task) => task.is_done);
  const allTasksDone = tasks.length > 0 && everyTaskDone;

  // Today's conditions, unchanged.
  const canCancel = CANCELLABLE_STATUSES.includes(job.status) && !(job.status === 'in_progress' && allTasksDone);
  const canDispute = hired && DISPUTABLE_STATUSES.includes(job.status);
  const canComplete = job.status === 'in_progress' && everyTaskDone;
  const canReview = job.status === 'completed' && hired && !job.has_review;

  const who = providerName(provider);
  const subject = who ?? 'Your provider';
  const object = who ?? 'your provider';
  const yourPayment = job.budget != null && Number(job.budget) > 0 ? `Your ${peso(job.budget)}` : 'Your payment';
  const note = disputeNote(dispute);
  // The one complaint action: the existing case if there is one, otherwise a new report.
  const complaint: Action | null = dispute ? { kind: 'viewCase' } : canDispute ? { kind: 'reportProblem' } : null;
  const cancel: Action | null = canCancel ? { kind: 'cancelJob' } : null;
  const message: Action = { kind: 'message', name: object };

  switch (job.status) {
    case 'open':
    case 'recommending':
      if (pendingCount === null) {
        // The lookup failed: no count and no "waiting", but the offers stay one tap away.
        return {
          card: {
            tone: 'action',
            overline: 'OPEN',
            title: 'Open for proposals',
            body: withNote("Providers near you can apply. We'll notify you.", note),
          },
          step: 'posted',
          main: { kind: 'findProviders' },
          link: { kind: 'viewOffers' },
          menu: menuItems(complaint, cancel),
        };
      }
      if (pendingCount > 0) {
        return {
          card: {
            tone: 'attention',
            overline: 'NEEDS YOU',
            title: `${plural(pendingCount, 'proposal')} waiting`,
            body: withNote('Compare proposals and hire someone. The job is not booked yet.', note),
          },
          step: 'posted',
          main: { kind: 'reviewProposals', count: pendingCount },
          link: { kind: 'findProviders' },
          menu: menuItems(complaint, cancel),
        };
      }
      return {
        card: {
          tone: 'action',
          overline: 'OPEN',
          title: 'Waiting for proposals',
          body: withNote("Providers near you can apply. We'll notify you.", note),
        },
        step: 'posted',
        main: { kind: 'findProviders' },
        link: null,
        menu: menuItems(complaint, cancel),
      };

    case 'assigned':
    case 'confirmed': {
      const when = formatDate(job.scheduled_at, WEEKDAY_MONTH_DAY);
      const time = job.scheduled_at ? timeOfDay(job.scheduled_at) : '';
      const where = [time, job.address].filter(Boolean).join(' · ');
      const held = `${yourPayment} is held safely and only released after the job is done.`;
      return {
        card: {
          tone: 'booked',
          overline: 'BOOKED',
          title: when ? `${subject} comes ${when}` : `${subject} is booked`,
          body: withNote(where ? `${where}. ${held}` : held, note),
        },
        step: 'hired',
        main: message,
        link: null,
        menu: menuItems(complaint, cancel),
      };
    }

    case 'in_progress': {
      if (canComplete) {
        // A job with no checklist is confirmed as today (every task of none is done), with copy that does not claim tasks.
        const noTasks = tasks.length === 0;
        return {
          card: {
            tone: 'action',
            overline: 'YOUR TURN',
            title: noTasks ? 'Confirm when the work is done' : 'The provider finished all tasks',
            body: withNote(
              noTasks
                ? 'This job has no checklist. Confirming releases the payment to the provider right away, so report any problem first.'
                : 'Check the work, then confirm. Confirming releases the payment to the provider right away, so report any problem first.',
              note,
            ),
          },
          step: 'working',
          main: { kind: 'confirmDone' },
          link: complaint,
          menu: menuItems(cancel),
        };
      }
      const done = tasks.filter((task) => task.is_done).length;
      return {
        card: {
          tone: 'booked',
          overline: 'WORKING',
          title: `${subject} is working on it`,
          body: withNote(`${done} of ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} done.`, note),
        },
        step: 'working',
        main: message,
        link: null,
        menu: menuItems(complaint, cancel),
      };
    }

    case 'completed': {
      const finished = formatDate(job.completed_at, MONTH_DAY);
      return {
        card: {
          tone: 'done',
          overline: finished ? `DONE · ${finished}` : 'DONE',
          title: 'Job completed',
          body: withNote(null, note),
        },
        step: 'done',
        main: canReview ? { kind: 'leaveReview' } : null,
        link: null,
        menu: menuItems(complaint),
      };
    }

    case 'expired': {
      const closed = expiredOn(job.posted_at);
      return {
        card: {
          tone: 'closed',
          overline: closed ? `EXPIRED · ${closed}` : 'EXPIRED',
          title: 'No one was hired in time',
          // The backend expires an unhired job a day after posting; naming a date here read oddly next to a later "When".
          body: withNote('No one was hired within 24 hours of posting. Post it again to get new proposals.', note),
        },
        step: 'posted',
        main: { kind: 'postAgain', categoryId: job.category_id },
        link: null,
        menu: menuItems(complaint),
      };
    }

    case 'cancelled': {
      if (dispute?.status === 'open') {
        // The card's own wording already says what the open complaint is about.
        const cancellationPending = dispute.cancellation_state === 'pending';
        const escrowDisputed = dispute.escrow_transactions?.status === 'disputed';
        return {
          card: {
            tone: 'closed',
            overline: 'CANCELLED · WAITING',
            title: cancellationPending
              ? `Waiting for ${object} to agree`
              : escrowDisputed
                ? 'Payment under admin review'
                : 'Complaint under review',
            body: cancellationPending
              ? `You asked to cancel after hiring. ${yourPayment} goes back to your payment method once they agree, or an admin decides.`
              : escrowDisputed
                ? 'The disputed payment stays frozen until an admin resolves it.'
                : 'An admin is reviewing the complaint.',
          },
          step: 'cancelled',
          main: { kind: 'viewCase' },
          link: null,
          menu: [],
        };
      }
      return {
        card: {
          tone: 'closed',
          overline: 'CANCELLED',
          title: 'Job cancelled',
          body: hired ? cancelledPayment(dispute?.resolution, yourPayment) : 'Providers can no longer apply.',
        },
        step: 'cancelled',
        main: { kind: 'postAgain', categoryId: job.category_id },
        link: dispute ? { kind: 'viewCase' } : null,
        menu: complaint?.kind === 'reportProblem' ? [complaint] : [],
      };
    }

    default:
      return {
        card: { tone: 'closed', overline: 'JOB', title: 'Nothing to do here' },
        step: null,
        main: null,
        link: null,
        menu: menuItems(complaint),
      };
  }
}

function providerName(provider: HomeownerJobInput['provider']): string | null {
  const name = provider?.profiles?.full_name?.trim();
  return name ? name : null;
}

/** The dispute line that used to sit on the bottom bar; it now belongs in the card body. */
function disputeNote(dispute: Dispute | null): string | null {
  if (dispute?.status !== 'open') return null;
  if (dispute.cancellation_state === 'pending') return 'Cancellation awaiting provider response.';
  if (dispute.escrow_transactions?.status === 'disputed') return 'Payment under admin review.';
  return 'Complaint awaiting admin review.';
}

/** Where a cancelled job's payment went. Only a resolution that says so may claim it. */
function cancelledPayment(resolution: Dispute['resolution'] | undefined, yourPayment: string): string {
  switch (resolution) {
    case 'released_to_provider':
      return `${yourPayment} was released to the provider.`;
    case 'reviewed':
      // An admin closed the case without moving the money, so no destination is named.
      return `${yourPayment} was settled by an admin review. Open the case for the outcome.`;
    case 'refunded_to_client':
      return `${yourPayment} was refunded to your payment method.`;
    default:
      // Nothing recorded yet: the refund is still on its way back to the payment method.
      return 'Your refund is being processed. It goes back to your payment method.';
  }
}

function withNote(body: string | null, note: string | null): string | undefined {
  return [body, note].filter(Boolean).join(' ') || undefined;
}

function menuItems(...items: Array<Action | null>): Action[] {
  return items.filter((item): item is Action => item !== null);
}

function formatDate(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', options);
}

/** The day a job closed: the backend expires it a day after posting. */
function expiredOn(postedAt: string): string {
  const posted = new Date(postedAt).getTime();
  return Number.isNaN(posted) ? '' : formatDate(new Date(posted + EXPIRY_MS), MONTH_DAY);
}
