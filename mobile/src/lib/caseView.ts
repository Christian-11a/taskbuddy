import type { Dispute, DisputeEntry } from './api';
import { peso } from './format';

/**
 * Plain-word mapping for a complaint or a cancellation request. Pure, so every
 * state can be tested without rendering. Backend codes (resolution,
 * cancellation_state, entry kinds) become sentences here and never reach the
 * screen.
 */

type Party = { full_name?: string | null } | null;

/**
 * Fields the case endpoint returns on top of the `Dispute` type in api.ts
 * (DISPUTE_SELECT in backend/src/escrow/disputes.service.ts). All optional, so
 * the mapping still works when one is missing.
 */
export type CaseDispute = Dispute & {
  raised_by?: string | null;
  raised_by_profile?: { id: string; full_name?: string | null } | null;
  jobs?: (NonNullable<Dispute['jobs']> & {
    title?: string | null;
    service_categories?: { name?: string | null } | null;
    client?: Party;
    provider?: Party;
  }) | null;
};

export type CaseTone = 'attention' | 'action' | 'closed';
export type CaseStatus = { tone: CaseTone; overline: string; title: string; body?: string };
export type CaseStep = {
  id: string;
  state: 'done' | 'current' | 'next';
  title: string;
  detail?: string;
  meta?: string;
  /** A photo attached to this step (signed URL). */
  photoUrl?: string;
  /** The step has a photo that could not be loaded. */
  photoUnavailable?: boolean;
  /** The job-chat message this step is linked to. */
  chatNote?: string;
};
export type CaseView = {
  heading: string;
  jobChip: string | null;
  status: CaseStatus;
  steps: CaseStep[];
  theirReason: string;
  counterpartName: string;
  closedBackLabel: string;
  agree: { title: string; message: string; confirmLabel: string };
  contest: { title: string; message: string; confirmLabel: string };
  sheetTitle: string;
  sheetIntro: string;
};

const HELD_STATUSES = ['held', 'disputed'];
const NARROW_SPACES = /[  ]/g;

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 6 · 6:59 PM": no seconds, plain spaces. */
export function caseDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return '';
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(NARROW_SPACES, ' ');
  return `${day} · ${time}`;
}

/** "Oct 7" */
function caseDay(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

const nameOf = (party: Party | undefined): string | null => party?.full_name?.trim() || null;
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const isSide = (entry: DisputeEntry) => entry.kind === 'statement' || entry.kind === 'appeal';

/** The escrow amount in pesos, or null when there is no money to talk about. */
function heldAmount(dispute: CaseDispute): number | null {
  const escrow = dispute.escrow_transactions;
  const amount = Number(escrow?.amount);
  return escrow && Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** The decision as a bare phrase (no prefix), or null when none was recorded. `amount` is formatted or null. */
function decisionPhrase(dispute: CaseDispute, amount: string | null): string | null {
  const money = amount ? `${amount} ` : '';
  switch (dispute.resolution) {
    case 'refunded_to_client':
      return `${money}refunded to the client`;
    case 'released_to_provider':
      return `${money}released to the provider`;
    case 'reviewed':
      // An agreed or automatic cancellation with nothing held has no admin decision.
      return dispute.cancellation_state === 'accepted' || dispute.cancellation_state === 'expired'
        ? 'cancelled'
        : 'reviewed by an admin';
    default:
      return null;
  }
}

/** Status card title for a closed case. */
function statusTitle(dispute: CaseDispute, amount: string | null, cancellation: boolean): string {
  const phrase = decisionPhrase(dispute, amount);
  if (phrase === null) return cancellation ? 'Cancelled' : 'Closed';
  if (phrase === 'cancelled') return 'Cancelled';
  if (phrase === 'reviewed by an admin') return 'Reviewed by an admin';
  return cancellation ? `Cancelled · ${phrase}` : capitalise(phrase);
}

/** Timeline line for the moment a case closed. */
function closingTitle(dispute: CaseDispute, amount: string | null): string {
  const phrase = decisionPhrase(dispute, amount);
  return phrase ? `Case closed · ${phrase}` : 'Case closed';
}

/** Status card, timeline, headings and confirm copy for a case, from the viewer's side. */
export function caseView(dispute: CaseDispute, me: string | null | undefined, now: number = Date.now()): CaseView {
  const job = dispute.jobs ?? null;
  const entries = dispute.entries ?? [];
  const isOpen = dispute.status === 'open';
  const isCancellation = dispute.cancellation_state != null;
  const pending = isOpen && dispute.cancellation_state === 'pending';
  const viewerIsClient = !!me && me === job?.client_id;
  const viewerIsProvider = !!me && me === job?.assigned_provider_id;
  const viewerIsReporter = !!me && (dispute.raised_by ?? dispute.raised_by_profile?.id) === me;
  const clientName = nameOf(job?.client);
  const providerName = nameOf(job?.provider);
  const counterpartName = viewerIsProvider ? clientName ?? 'the client' : providerName ?? 'the provider';
  const reporterName = nameOf(dispute.raised_by_profile);
  const isOther = (author: DisputeEntry['author']) => !!author?.id && author.id !== me;

  const held = heldAmount(dispute);
  const amount = held == null ? null : peso(held);
  const deadlineMs = dispute.cancellation_deadline ? new Date(dispute.cancellation_deadline).getTime() : Number.NaN;
  const deadline = Number.isNaN(deadlineMs) ? '' : caseDate(dispute.cancellation_deadline);
  const responseOpen = pending && viewerIsProvider && now < deadlineMs;
  const escrowStatus = dispute.escrow_transactions?.status ?? '';
  const stillHeld = isOpen && held != null && HELD_STATUSES.includes(escrowStatus);
  const heldLine = stillHeld
    ? (viewerIsClient ? `Your ${amount} stays held until it's decided.` : `The ${amount} stays held until it's decided.`)
    : undefined;

  function closedBody(): string | undefined {
    if (dispute.cancellation_state === 'accepted') {
      return viewerIsProvider
        ? 'You agreed to cancel. Nothing more is needed from you.'
        : `${capitalise(counterpartName)} agreed to cancel. Nothing more is needed from you.`;
    }
    if (dispute.cancellation_state === 'expired') return 'No response in time, so the request closed automatically.';
    return dispute.resolution_note?.trim() || undefined;
  }

  function pendingStatus(): CaseStatus {
    if (viewerIsProvider && responseOpen) {
      return {
        tone: 'action',
        overline: `RESPOND BY ${deadline.toUpperCase()}`,
        title: 'The client wants to cancel',
        body: amount
          ? `If you don't respond in time, the client gets the ${amount} back automatically.`
          : "If you don't respond in time, the client gets the money back automatically.",
      };
    }
    if (viewerIsProvider) {
      return {
        tone: 'attention',
        overline: 'RESPONSE TIME ENDED',
        title: 'The time to respond has passed',
        body: amount ? `The client gets the ${amount} back automatically.` : 'The client gets the money back automatically.',
      };
    }
    const money = amount ? `the ${amount}` : 'the money';
    return {
      tone: 'attention',
      overline: 'AWAITING RESPONSE',
      title: `Waiting for ${counterpartName} to respond`,
      body: deadline
        ? `If they don't respond by ${deadline}, ${money} goes back to you automatically.`
        : `If they don't respond in time, ${money} goes back to you automatically.`,
    };
  }

  let status: CaseStatus;
  if (!isOpen) {
    const closedOn = caseDay(dispute.resolved_at ?? dispute.created_at);
    status = {
      tone: 'closed',
      overline: closedOn ? `CLOSED · ${closedOn.toUpperCase()}` : 'CLOSED',
      title: statusTitle(dispute, amount, isCancellation),
      body: closedBody(),
    };
  } else if (pending) {
    status = pendingStatus();
  } else {
    status = {
      tone: 'attention',
      overline: 'UNDER REVIEW',
      title: isCancellation
        ? 'An admin is reviewing this cancellation'
        : viewerIsReporter ? 'An admin is reviewing your report' : 'An admin is reviewing this report',
      body: heldLine,
    };
  }

  const closing = closingTitle(dispute, amount);
  const lastResolution = [...entries].reverse().find((entry) => entry.kind === 'resolution');
  const closingEntryId = isOpen ? undefined : lastResolution?.id;

  function responseTitle(byMe: boolean, who: string): string {
    if (dispute.cancellation_state === 'accepted') return byMe ? 'You agreed to cancel' : `${who} agreed to cancel`;
    if (dispute.cancellation_state === 'contested') return byMe ? 'You contested the cancellation' : `${who} contested the cancellation`;
    return byMe ? 'You responded to the cancellation' : `${who} responded to the cancellation`;
  }

  function entryStep(entry: DisputeEntry): CaseStep {
    const byMe = !!me && entry.author?.id === me;
    const who = byMe ? 'You' : entry.author?.full_name?.trim() || 'Someone';
    const when = caseDate(entry.created_at);
    const common = {
      id: entry.id,
      state: 'done' as const,
      meta: when,
      photoUrl: entry.attachment_url ?? undefined,
      photoUnavailable: !!entry.message?.attachment_path && !entry.attachment_url,
      chatNote: entry.message ? `From the job chat: ${entry.message.body?.trim() || 'a photo'}` : undefined,
    };
    switch (entry.kind) {
      case 'statement':
        return { ...common, title: `${who} added details`, detail: entry.body };
      case 'appeal':
        return { ...common, title: `${who} appealed`, detail: entry.body };
      case 'clarification':
        return { ...common, title: entry.body, meta: `${entry.author?.full_name?.trim() || 'Admin'} · ${when}` };
      case 'resolution':
        if (entry.id === closingEntryId) return { id: entry.id, state: 'done', title: closing, meta: when };
        return { id: entry.id, state: 'done', title: 'Admin decision recorded', detail: entry.body, meta: when };
      case 'cancellation_response':
        return { ...common, title: responseTitle(byMe, who), detail: entry.body };
      default:
        // System lines and anything newer: the entry's own words.
        return { ...common, title: entry.body };
    }
  }

  const refundStep: CaseStep = {
    id: 'refund', state: 'next', title: 'Refund or admin review', detail: 'Agreeing refunds the client. Contesting sends it to an admin.',
  };
  const adminStep: CaseStep = { id: 'admin', state: 'next', title: 'Admin decides', detail: "You'll be notified" };

  function openSteps(): CaseStep[] {
    if (pending) {
      if (!viewerIsProvider) {
        return [
          { id: 'current', state: 'current', title: `Waiting for ${counterpartName}'s answer`, detail: 'They can agree or contest before the deadline.' },
          refundStep,
        ];
      }
      if (responseOpen) {
        return [{ id: 'current', state: 'current', title: 'Your answer is needed', detail: 'Agree or contest before the deadline.' }, refundStep];
      }
      return [{ id: 'current', state: 'current', title: 'No answer in time' }];
    }
    if (isCancellation) {
      return [{ id: 'current', state: 'current', title: 'An admin reviews both sides' }, adminStep];
    }
    // The report itself is the reporter's side; the other party must add theirs.
    const iSpoke = viewerIsReporter || entries.some((entry) => isSide(entry) && !!me && entry.author?.id === me);
    const counterpartSpoke = viewerIsReporter
      ? entries.some((entry) => isSide(entry) && isOther(entry.author))
      : true;
    if (!counterpartSpoke) {
      return [
        { id: 'current', state: 'current', title: `Waiting for ${counterpartName}'s side`, detail: 'They can add a statement too.' },
        adminStep,
      ];
    }
    return [
      { id: 'current', state: 'current', title: 'An admin reviews both sides', detail: iSpoke ? undefined : 'You can add your side too.' },
      adminStep,
    ];
  }

  const steps: CaseStep[] = [];
  steps.push(isCancellation
    ? {
      id: 'request',
      state: 'done',
      title: viewerIsReporter ? 'You asked to cancel' : pending ? 'The client asked to cancel' : 'Cancellation requested',
      meta: caseDate(dispute.created_at),
    }
    : {
      id: 'report',
      state: 'done',
      title: `${viewerIsReporter ? 'You' : reporterName ?? 'They'} reported: ${dispute.reason}`,
      detail: dispute.details?.trim() || undefined,
      meta: caseDate(dispute.created_at),
    });
  for (const entry of entries) steps.push(entryStep(entry));
  if (!isOpen && !closingEntryId) {
    steps.push({ id: 'closed', state: 'done', title: closing, meta: caseDate(dispute.resolved_at ?? dispute.created_at) });
  }
  if (isOpen) steps.push(...openSteps());

  const title = job?.title?.trim();
  const category = job?.service_categories?.name?.trim();
  const jobHead = title ? (category ? `${category}: ${title}` : title) : null;
  const jobChip = jobHead && amount ? `${jobHead} · ${amount}` : jobHead;

  const moneyLine = dispute.escrow_transactions
    ? (amount ? `${amount} goes back to the client's wallet.` : "The payment goes back to the client's wallet.")
    : null;

  return {
    heading: isCancellation ? 'Cancellation request' : viewerIsReporter ? 'Your report' : 'Report about this job',
    jobChip,
    status,
    steps,
    theirReason: isCancellation || !dispute.reason?.trim()
      ? 'No reason given'
      : [dispute.reason.trim(), dispute.details?.trim()].filter(Boolean).join('\n'),
    counterpartName,
    closedBackLabel: `Back to ${viewerIsProvider ? 'My Work' : 'My Jobs'}`,
    agree: {
      title: 'Agree to cancel?',
      message: [moneyLine, 'The booking is removed from your schedule.', "This can't be undone."]
        .filter((line): line is string => !!line)
        .join('\n'),
      confirmLabel: amount ? `Agree and refund ${amount}` : 'Agree and refund',
    },
    contest: {
      title: 'Contest this cancellation?',
      message: 'An admin will review both sides and decide. The payment stays held until then.',
      confirmLabel: 'Contest',
    },
    sheetTitle: isOpen ? 'Add to your case' : 'Appeal this decision',
    sheetIntro: isOpen
      ? 'Describe your position. To add a photo, send it in the job chat, then pick that message below.'
      : 'An appeal reopens review. It does not reverse payments that were already settled.',
  };
}
