/**
 * What a provider sees on Job Details, decided in one pure function so the
 * screen only renders the result. Every branch comes from the same conditions
 * the screen used before the redesign (canApply, isConfirmed, isWorking,
 * isDone, isCancelled, the verification gate and the complaint rules), so a
 * money action is offered in exactly the states it was offered before.
 *
 * The `Action` and `JobView` types are copied from the phase 6 plan, which
 * defines them for jobDetailView.ts too. This copy keeps the two identical.
 */

import type { Dispute, Job, JobTask } from './api';
import type { ProgressStep } from '../components/ui/ProgressStepper';
import type { StatusCardTone } from '../components/ui/StatusCard';
import { withDisputeBanner } from './jobDetailView';
import { peso, timeOfDay } from './format';
import { dayHeading } from './jobCalendar';
import { dateKeyOf, parseDateKey } from './localDate';

export type Action =
  | { kind: 'reviewProposals'; count: number }   // → onNavigate('Job Applications', job.id)
  | { kind: 'findProviders' }                    // → existing findProviders() (api.triggerRecommendations)
  | { kind: 'viewOffers' }                       // → onNavigate('Job Applications', job.id) (homeowner only; kept so the two copies match)
  | { kind: 'message'; name: string }            // → onNavigate('Chat', job.id)
  | { kind: 'confirmDone' }                      // → existing confirm-completion modal → api.completeJob
  | { kind: 'reportProblem' }                    // → onNavigate('Dispute Filing', job.id)
  | { kind: 'viewCase' }                         // → onNavigate('Dispute Status', job.id)
  | { kind: 'leaveReview' }                      // → onNavigate('Leave Review', job.id)
  | { kind: 'postAgain'; categoryId: number }    // → onNavigate('Create Job', String(categoryId)) (category pre-selected)
  | { kind: 'cancelJob' }                        // → existing cancel modal → api.cancelJob
  // provider
  | { kind: 'sendProposal' } | { kind: 'getVerified' } | { kind: 'withdrawProposal' }
  | { kind: 'findJobs' } | { kind: 'startJob' } | { kind: 'declineBooking' } | { kind: 'viewWallet' };

export type JobView = {
  card: { tone: StatusCardTone; overline: string; title: string; body?: string };
  step: ProgressStep | null;            // null = hide the stepper (e.g. provider before applying)
  main: Action | null; link: Action | null; menu: Action[];
  banner?: { text: string; action: Action };
};

/** The provider's proposal for this job, as `GET /applications/mine` returns it. */
export type ProviderApplication = {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  applied_at?: string | null;
  decided_at?: string | null;
  cover_message?: string | null;
};

export type ProviderJobViewInput = {
  job: Job;
  /** The signed-in provider. Null while the profile is loading. */
  me: { id: string } | null;
  /** The provider's proposal for this job, if they sent one. */
  myApplication: ProviderApplication | null | undefined;
  /** The job's complaint, if one exists. Only read for a job hired to `me`. */
  dispute: Dispute | null | undefined;
  /** The checklist, already sorted by position. */
  tasks: JobTask[];
  isVerified: boolean;
  now: Date;
};

const OPEN_STATUSES: readonly string[] = ['open', 'recommending'];
const BOOKED_STATUSES: readonly string[] = ['assigned', 'confirmed'];

const FIND_JOBS: Action = { kind: 'findJobs' };
const START_JOB: Action = { kind: 'startJob' };
const DECLINE: Action = { kind: 'declineBooking' };
const MESSAGE: Action = { kind: 'message', name: 'client' };
const VIEW_WALLET: Action = { kind: 'viewWallet' };
const VIEW_CASE: Action = { kind: 'viewCase' };
const REPORT: Action = { kind: 'reportProblem' };

export function providerJobView({ job, me, myApplication, dispute, tasks, isVerified }: ProviderJobViewInput): JobView {
  const mine = !!me && job.assigned_provider_id === me.id;
  const view = mine
    ? hiredView(job, dispute, tasks)
    : unhiredView(job, myApplication, isVerified);
  return mine ? withDisputeBanner(view, job) : view;
}

/** A job I was not hired for: I may apply, I applied, or it is closed to me. */
function unhiredView(job: Job, application: ProviderApplication | null | undefined, isVerified: boolean): JobView {
  const open = OPEN_STATUSES.includes(job.status);
  if (application) {
    switch (application.status) {
      case 'withdrawn':
        return jobView(card('closed', 'WITHDRAWN', 'You withdrew this proposal'), null, FIND_JOBS);
      case 'rejected':
        return notAccepted(application);
      case 'pending':
        if (open) return waiting();
        if (job.status === 'cancelled') return cancelledNotHired();
        if (job.status === 'expired') return expiredNotHired();
        // The client chose someone else (or the job closed without a hire).
        return notAccepted(application);
      case 'accepted':
        // Accepted means hired, but the job does not show me as its provider.
        return closedTaken();
    }
  }
  if (open) return isVerified ? newJob(job) : verifyFirst();
  if (job.status === 'expired') return expiredNotHired();
  if (job.status === 'cancelled') return cancelledNotHired();
  return closedTaken();
}

/** A job hired to me: booked, working, done, or cancelled. */
function hiredView(job: Job, dispute: Dispute | null | undefined, tasks: JobTask[]): JobView {
  const status = job.status;
  const paid = Number(job.budget ?? 0) > 0;
  const openCase = dispute?.status === 'open' ? dispute : null;
  const isBooked = BOOKED_STATUSES.includes(status);
  const isWorking = status === 'in_progress';
  const isDone = status === 'completed';
  const isCancelled = status === 'cancelled';
  // A complaint is offered only while the job is booked, working or cancelled: once the client
  // confirms completion, payment is released and no new report can be raised. An existing case
  // is still shown, so it can be followed up.
  const complaint: Action | null = dispute
    ? VIEW_CASE
    : isBooked || isWorking || isCancelled ? REPORT : null;

  if (isCancelled) {
    if (openCase) return jobView(cancelledCase(openCase), 'cancelled', VIEW_CASE);
    if (dispute) return jobView(card('closed', 'CANCELLED', 'This job was cancelled'), 'cancelled', FIND_JOBS, VIEW_CASE);
    return jobView(card('closed', 'CANCELLED', 'This job was cancelled'), 'cancelled', FIND_JOBS, null, [REPORT]);
  }

  let result: JobView;
  if (isBooked) {
    result = jobView(bookedCard(job, paid), 'hired', START_JOB, DECLINE);
  } else if (isWorking) {
    result = jobView(workingCard(tasks, paid), 'working', MESSAGE);
  } else if (isDone) {
    result = jobView(doneCard(job, paid), 'done', VIEW_WALLET);
  } else if (status === 'expired') {
    result = jobView(card('closed', 'EXPIRED', 'This job expired', 'No one was hired before it expired.'), null, FIND_JOBS);
  } else {
    result = jobView(card('closed', 'CLOSED', 'This job is no longer active'), null, FIND_JOBS);
  }
  // An open complaint replaces the card's wording, but never removes what the provider could do before.
  if (openCase) result = { ...result, card: underReview(openCase) };
  result.menu = complaint ? [complaint] : [];
  return result;
}

function newJob(job: Job): JobView {
  const when = heading(job.scheduled_at);
  return jobView(
    card(
      'action',
      'NEW JOB',
      when ? `Client wants this done by ${when}` : 'Client needs this as soon as possible',
      'Send a proposal. The client compares proposals and hires one provider.',
    ),
    null,
    { kind: 'sendProposal' },
  );
}

function verifyFirst(): JobView {
  return jobView(
    card('attention', 'VERIFY FIRST', 'Get verified to apply', 'Verify your identity before applying to jobs.'),
    null,
    { kind: 'getVerified' },
  );
}

function waiting(): JobView {
  return jobView(
    card(
      'attention',
      'WAITING FOR CLIENT',
      'Your proposal is in',
      "The client is comparing proposals. We'll notify you the moment they decide.",
    ),
    'posted',
    FIND_JOBS,
    { kind: 'withdrawProposal' },
  );
}

function notAccepted(application: ProviderApplication): JobView {
  const date = monthDay(application.decided_at);
  return jobView(
    card(
      'closed',
      date ? `NOT ACCEPTED · ${date.toUpperCase()}` : 'NOT ACCEPTED',
      "Your proposal wasn't accepted",
      'That happens. Similar jobs near you are open right now.',
    ),
    null,
    FIND_JOBS,
  );
}

function cancelledNotHired(): JobView {
  return jobView(card('closed', 'CANCELLED', 'This job was cancelled'), null, FIND_JOBS);
}

function expiredNotHired(): JobView {
  return jobView(card('closed', 'EXPIRED', 'This job expired', 'No one was hired before it expired.'), null, FIND_JOBS);
}

function closedTaken(): JobView {
  return jobView(card('closed', 'CLOSED', 'This job is no longer open', 'The client has chosen a provider.'), null, FIND_JOBS);
}

function bookedCard(job: Job, paid: boolean): JobView['card'] {
  const when = heading(job.scheduled_at);
  const time = clock(job.scheduled_at);
  const lines = [
    time ? `${time}.` : null,
    paid
      ? `The client already paid ${peso(job.budget)}. It's held safely and released to you as soon as the client confirms the job is done.`
      : null,
  ].filter((line): line is string => line !== null);
  return card(
    'booked',
    when ? `BOOKED · ${when.toUpperCase()}` : 'BOOKED',
    `Go to ${job.address}`,
    lines.length ? lines.join(' ') : undefined,
  );
}

function workingCard(tasks: JobTask[], paid: boolean): JobView['card'] {
  const paidLine = paid ? ' Payment is released as soon as the client confirms.' : '';
  const doneCount = tasks.filter((task) => task.is_done).length;
  if (tasks.length === 0) {
    return card('booked', 'WORKING', 'Work in progress', `When the work is done, the client is asked to confirm.${paidLine}`);
  }
  if (doneCount === tasks.length) {
    return card('booked', 'WORKING', 'Waiting for client to confirm completion', `All tasks are ticked.${paidLine}`);
  }
  return card('booked', 'WORKING', 'Tick tasks as you finish them', `When all are ticked, the client is asked to confirm.${paidLine}`);
}

function doneCard(job: Job, paid: boolean): JobView['card'] {
  const finished = monthDay(job.completed_at);
  return card(
    'done',
    finished ? `DONE · ${finished.toUpperCase()}` : 'DONE',
    paid ? 'Nice work! Your payment is on its way' : 'Nice work! This job is complete',
  );
}

/** A client cancelled after the hire and the provider has to answer, or a case is open. */
function cancelledCase(dispute: Dispute): JobView['card'] {
  if (dispute.cancellation_state === 'pending') {
    return card('closed', 'CANCELLED', 'The client asked to cancel', responseBody(dispute.cancellation_deadline));
  }
  if (dispute.escrow_transactions?.status === 'disputed') {
    return card('closed', 'CANCELLED', 'Payment under admin review');
  }
  return card('closed', 'CANCELLED', 'Complaint awaiting admin review');
}

/** The card for a complaint on a job that is not cancelled. The state's own action stays where it was. */
function underReview(dispute: Dispute): JobView['card'] {
  return card(
    'attention',
    'UNDER REVIEW',
    dispute.escrow_transactions?.status === 'disputed'
      ? 'Payment under admin review'
      : 'Complaint awaiting admin review',
  );
}

function responseBody(deadline: string | null | undefined): string {
  const day = monthDay(deadline);
  const time = clock(deadline);
  return day && time
    ? `Agree or contest by ${day}, ${time}. No response refunds the client.`
    : 'Agree or contest within 48 hours. No response refunds the client.';
}

function card(tone: StatusCardTone, overline: string, title: string, body?: string): JobView['card'] {
  return body === undefined ? { tone, overline, title } : { tone, overline, title, body };
}

function jobView(
  shownCard: JobView['card'],
  step: ProgressStep | null,
  main: Action | null,
  link: Action | null = null,
  menu: Action[] = [],
): JobView {
  return { card: shownCard, step, main, link, menu };
}

/** "Wed, Oct 15" for a timestamp's local day, or null when it has none. */
function heading(iso: string | null | undefined): string | null {
  const key = dateKeyOf(iso);
  return key ? dayHeading(key) : null;
}

/** "Oct 15" for a timestamp's local day, or null when it has none. */
export function monthDay(iso: string | null | undefined): string | null {
  const key = dateKeyOf(iso);
  return key ? parseDateKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
}

/** "9:45 AM" for a timestamp, or null when it has none. */
function clock(iso: string | null | undefined): string | null {
  return timeOfDay(iso) || null;
}
