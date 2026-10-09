import type { Dispute, Job, JobTask } from '../api';
import { timeOfDay } from '../format';
import { homeownerJobView, type Action, type JobView } from '../jobDetailView';

const DAY = 86_400_000;
// Fri, Oct 9 2026 at noon, local time. Every date below is built from local time so the day names match in any zone.
const NOW = new Date(2026, 9, 9, 12, 0).getTime();
const at = (year: number, month: number, day: number, hour = 9, minute = 0) =>
  new Date(year, month, day, hour, minute).toISOString();
// Oct 15 2026 is a Thursday.
const SCHEDULED = at(2026, 9, 15, 9, 0);
const PROVIDER = { profiles: { full_name: 'TaskBuddyProvider' } };

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    client_id: 'client-1',
    category_id: 7,
    title: 'Fix the sink',
    description: 'Leaky kitchen sink',
    urgency: 'normal',
    status: 'open',
    address: 'Arturo Tanco Drive, Lipa',
    latitude: 13.9,
    longitude: 121.1,
    provider_accept_address: null,
    provider_accept_latitude: null,
    provider_accept_longitude: null,
    posted_at: at(2026, 9, 8),
    assigned_provider_id: null,
    assigned_at: null,
    completed_at: null,
    budget: 1500,
    scheduled_at: null,
    photo_urls: [],
    created_at: at(2026, 9, 8),
    job_tasks: [],
    ...overrides,
  };
}

function dispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: 'dispute-1',
    job_id: 'job-1',
    reason: 'Work not finished',
    details: null,
    status: 'open',
    resolution: null,
    resolution_note: null,
    resolved_at: null,
    created_at: at(2026, 9, 9, 10),
    ...overrides,
  };
}

const task = (is_done: boolean, position = 0): JobTask => ({
  id: `t${position}`,
  label: `Task ${position}`,
  position,
  is_done,
  completed_at: null,
});

type Setup = {
  job?: Partial<Job>;
  dispute?: Dispute | null;
  pending?: number;
  tasks?: JobTask[];
  provider?: typeof PROVIDER | null;
};

/** The screen's inputs, built the way the screen builds them. */
function viewFor({ job: overrides = {}, dispute: d = null, pending = 0, tasks, provider }: Setup = {}): JobView {
  const j = job(overrides);
  return homeownerJobView({
    job: j,
    dispute: d,
    pendingCount: pending,
    tasks: tasks ?? j.job_tasks ?? [],
    provider: provider !== undefined ? provider : j.assigned_provider_id ? PROVIDER : null,
    now: NOW,
  });
}

function reachable(view: JobView): Action[] {
  return [...(view.main ? [view.main] : []), ...(view.link ? [view.link] : []), ...view.menu];
}

describe('homeownerJobView: open or recommending', () => {
  it('two proposals waiting: review them first, find providers as the link, cancel in the menu', () => {
    expect(viewFor({ pending: 2 })).toEqual({
      card: {
        tone: 'attention',
        overline: 'NEEDS YOU',
        title: '2 proposals waiting',
        body: 'Compare offers and hire someone. The job is not booked yet.',
      },
      step: 'posted',
      main: { kind: 'reviewProposals', count: 2 },
      link: { kind: 'findProviders' },
      menu: [{ kind: 'cancelJob' }],
    });
  });

  it('one proposal waiting uses the singular, and recommending counts the same as open', () => {
    expect(viewFor({ job: { status: 'recommending' }, pending: 1 })).toEqual({
      card: {
        tone: 'attention',
        overline: 'NEEDS YOU',
        title: '1 proposal waiting',
        body: 'Compare offers and hire someone. The job is not booked yet.',
      },
      step: 'posted',
      main: { kind: 'reviewProposals', count: 1 },
      link: { kind: 'findProviders' },
      menu: [{ kind: 'cancelJob' }],
    });
  });

  it('no proposals yet: find providers is the main action and there is no link', () => {
    expect(viewFor({ pending: 0 })).toEqual({
      card: {
        tone: 'action',
        overline: 'OPEN',
        title: 'Waiting for offers',
        body: "Providers near you can apply. We'll notify you.",
      },
      step: 'posted',
      main: { kind: 'findProviders' },
      link: null,
      menu: [{ kind: 'cancelJob' }],
    });
  });

  it('a complaint on an open job still reaches its case, from the menu', () => {
    const view = viewFor({ pending: 0, dispute: dispute() });
    expect(view.main).toEqual({ kind: 'findProviders' });
    expect(view.menu).toEqual([{ kind: 'viewCase' }, { kind: 'cancelJob' }]);
    expect(view.card.body).toBe("Providers near you can apply. We'll notify you. Complaint awaiting admin review.");
  });
});

describe('homeownerJobView: hired (assigned or confirmed)', () => {
  it('booked with a date: the provider comes on that day, message is the main action', () => {
    expect(viewFor({ job: { status: 'confirmed', assigned_provider_id: 'p1', scheduled_at: SCHEDULED } })).toEqual({
      card: {
        tone: 'booked',
        overline: 'BOOKED',
        title: 'TaskBuddyProvider comes Thu, Oct 15',
        body: `${timeOfDay(SCHEDULED)} · Arturo Tanco Drive, Lipa. Your ₱1,500.00 is held safely until the job is done.`,
      },
      step: 'hired',
      main: { kind: 'message', name: 'TaskBuddyProvider' },
      link: null,
      menu: [{ kind: 'reportProblem' }, { kind: 'cancelJob' }],
    });
  });

  it('booked with no date: "is booked" and no time in the line', () => {
    const view = viewFor({ job: { status: 'assigned', assigned_provider_id: 'p1', scheduled_at: null } });
    expect(view.card).toEqual({
      tone: 'booked',
      overline: 'BOOKED',
      title: 'TaskBuddyProvider is booked',
      body: 'Arturo Tanco Drive, Lipa. Your ₱1,500.00 is held safely until the job is done.',
    });
  });

  it('provider not loaded: the copy says "your provider" and message still goes to the chat', () => {
    const view = viewFor({
      job: { status: 'confirmed', assigned_provider_id: 'p1', scheduled_at: SCHEDULED },
      provider: null,
    });
    expect(view.card.title).toBe('Your provider comes Thu, Oct 15');
    expect(view.main).toEqual({ kind: 'message', name: 'your provider' });
  });

  it('no budget: the held line does not invent an amount', () => {
    const view = viewFor({ job: { status: 'confirmed', assigned_provider_id: 'p1', budget: null } });
    expect(view.card.body).toBe('Arturo Tanco Drive, Lipa. Your payment is held safely until the job is done.');
  });

  it('a complaint on a booked job reaches its case from the menu instead of reporting a new one', () => {
    const view = viewFor({ job: { status: 'confirmed', assigned_provider_id: 'p1' }, dispute: dispute() });
    expect(view.menu).toEqual([{ kind: 'viewCase' }, { kind: 'cancelJob' }]);
    expect(view.card.body).toContain('Complaint awaiting admin review.');
  });

  it('a payment under admin review is noted in the card body, not as a bar', () => {
    const view = viewFor({
      job: { status: 'confirmed', assigned_provider_id: 'p1' },
      dispute: dispute({ escrow_transactions: { status: 'disputed', amount: 1500 } }),
    });
    expect(view.card.body).toContain('Payment under admin review.');
  });
});

describe('homeownerJobView: in progress', () => {
  it('tasks still open: WORKING, message is the main action, report and cancel in the menu', () => {
    const tasks = [task(true, 0), task(false, 1), task(false, 2)];
    expect(viewFor({ job: { status: 'in_progress', assigned_provider_id: 'p1', job_tasks: tasks } })).toEqual({
      card: {
        tone: 'booked',
        overline: 'WORKING',
        title: 'TaskBuddyProvider is working on it',
        body: '1 of 3 tasks done.',
      },
      step: 'working',
      main: { kind: 'message', name: 'TaskBuddyProvider' },
      link: null,
      menu: [{ kind: 'reportProblem' }, { kind: 'cancelJob' }],
    });
  });

  it('one task that is not done reads "0 of 1 task done"', () => {
    const view = viewFor({ job: { status: 'in_progress', assigned_provider_id: 'p1', job_tasks: [task(false)] } });
    expect(view.card.body).toBe('0 of 1 task done.');
    expect(view.main).toEqual({ kind: 'message', name: 'TaskBuddyProvider' });
  });

  it('every task done: YOUR TURN, confirm is the main action, report is the link, nothing to cancel', () => {
    const tasks = [task(true, 0), task(true, 1)];
    expect(viewFor({ job: { status: 'in_progress', assigned_provider_id: 'p1', job_tasks: tasks } })).toEqual({
      card: {
        tone: 'action',
        overline: 'YOUR TURN',
        title: 'The provider finished all tasks',
        body: 'Check the work, then confirm. Payment is released when you confirm.',
      },
      step: 'working',
      main: { kind: 'confirmDone' },
      link: { kind: 'reportProblem' },
      menu: [],
    });
  });

  it('no task list at all: confirm is still offered (as today) with honest copy, and cancel stays in the menu', () => {
    const view = viewFor({ job: { status: 'in_progress', assigned_provider_id: 'p1', job_tasks: [] } });
    expect(view).toEqual({
      card: {
        tone: 'action',
        overline: 'YOUR TURN',
        title: 'Confirm when the work is done',
        body: 'This job has no checklist. Payment is released when you confirm.',
      },
      step: 'working',
      main: { kind: 'confirmDone' },
      link: { kind: 'reportProblem' },
      menu: [{ kind: 'cancelJob' }],
    });
  });

  it('every task done with a complaint open: the case is the link, not a new report', () => {
    const view = viewFor({
      job: { status: 'in_progress', assigned_provider_id: 'p1', job_tasks: [task(true)] },
      dispute: dispute(),
    });
    expect(view.main).toEqual({ kind: 'confirmDone' });
    expect(view.link).toEqual({ kind: 'viewCase' });
    expect(view.card.body).toBe('Check the work, then confirm. Payment is released when you confirm. Complaint awaiting admin review.');
  });

  it('in progress without a provider on the job: no report or case is offered', () => {
    const view = viewFor({ job: { status: 'in_progress', assigned_provider_id: null, job_tasks: [task(false)] } });
    expect(view.menu).toEqual([{ kind: 'cancelJob' }]);
    expect(view.link).toBeNull();
  });
});

describe('homeownerJobView: completed', () => {
  const completedBase = {
    status: 'completed' as const,
    assigned_provider_id: 'p1',
    completed_at: at(2026, 9, 7, 10),
    warranty_expires_at: new Date(NOW + 2 * DAY).toISOString(),
  };

  it('inside the warranty: DONE with the warranty date, leave a review, report a problem in the menu', () => {
    expect(viewFor({ job: completedBase })).toEqual({
      card: {
        tone: 'done',
        overline: 'DONE · Oct 7',
        title: 'Job completed',
        body: 'Warranty until Oct 11. Something wrong? Report it before then.',
      },
      step: 'done',
      main: { kind: 'leaveReview' },
      link: null,
      menu: [{ kind: 'reportProblem' }],
    });
  });

  it('warranty expired: no warranty line, no report', () => {
    const view = viewFor({ job: { ...completedBase, warranty_expires_at: new Date(NOW - DAY).toISOString() } });
    expect(view.card.body).toBeUndefined();
    expect(view.main).toEqual({ kind: 'leaveReview' });
    expect(view.menu).toEqual([]);
  });

  it('warranty exactly at the current time counts as expired', () => {
    const view = viewFor({ job: { ...completedBase, warranty_expires_at: new Date(NOW).toISOString() } });
    expect(view.card.body).toBeUndefined();
    expect(view.menu).toEqual([]);
  });

  it('no warranty field at all: no warranty line and no report', () => {
    const view = viewFor({ job: { ...completedBase, warranty_expires_at: undefined } });
    expect(view.card.body).toBeUndefined();
    expect(view.menu).toEqual([]);
  });

  it('review already submitted: no main button, the report stays available inside the warranty', () => {
    const view = viewFor({ job: { ...completedBase, has_review: true } });
    expect(view.main).toBeNull();
    expect(view.link).toBeNull();
    expect(view.menu).toEqual([{ kind: 'reportProblem' }]);
  });

  it('no provider on the job: no review and no report', () => {
    const view = viewFor({ job: { ...completedBase, assigned_provider_id: null } });
    expect(view.main).toBeNull();
    expect(view.menu).toEqual([]);
  });

  it('a complaint open inside the warranty: the case is in the menu and its note in the body', () => {
    const view = viewFor({ job: completedBase, dispute: dispute() });
    expect(view.menu).toEqual([{ kind: 'viewCase' }]);
    expect(view.card.body).toBe('Warranty until Oct 11. Something wrong? Report it before then. Complaint awaiting admin review.');
  });

  it('an old complaint after the warranty still reaches its case', () => {
    const view = viewFor({
      job: { ...completedBase, warranty_expires_at: new Date(NOW - DAY).toISOString() },
      dispute: dispute({ status: 'resolved', resolution: 'reviewed', resolved_at: at(2026, 9, 8) }),
    });
    expect(view.menu).toEqual([{ kind: 'viewCase' }]);
    expect(view.card.body).toBeUndefined();
  });

  it('no completion date: the overline is just DONE', () => {
    const view = viewFor({ job: { ...completedBase, completed_at: null } });
    expect(view.card.overline).toBe('DONE');
  });
});

describe('homeownerJobView: expired', () => {
  it('nobody hired in time: post again for the same category, no menu', () => {
    expect(viewFor({ job: { status: 'expired', posted_at: at(2026, 8, 30, 21, 29) } })).toEqual({
      card: {
        tone: 'closed',
        overline: 'EXPIRED · Oct 1',
        title: 'No one was hired in time',
        body: 'This job closed on Oct 1. Post it again to get new offers.',
      },
      step: 'posted',
      main: { kind: 'postAgain', categoryId: 7 },
      link: null,
      menu: [],
    });
  });

  it('a date that cannot be read: no date in the overline or body', () => {
    const view = viewFor({ job: { status: 'expired', posted_at: 'not a date' } });
    expect(view.card.overline).toBe('EXPIRED');
    expect(view.card.body).toBe('Post it again to get new offers.');
  });

  it('a complaint on an expired job still reaches its case, from the menu', () => {
    const view = viewFor({ job: { status: 'expired', posted_at: at(2026, 8, 30, 21, 29) }, dispute: dispute() });
    expect(view.menu).toEqual([{ kind: 'viewCase' }]);
  });
});

describe('homeownerJobView: cancelled', () => {
  const hired = { status: 'cancelled' as const, assigned_provider_id: 'p1' };

  it('cancellation waiting for the provider: WAITING, the case is the main action', () => {
    expect(viewFor({
      job: hired,
      dispute: dispute({ cancellation_state: 'pending' }),
    })).toEqual({
      card: {
        tone: 'closed',
        overline: 'CANCELLED · WAITING',
        title: 'Waiting for TaskBuddyProvider to agree',
        body: 'You asked to cancel after hiring. Your ₱1,500.00 goes back to your wallet once they agree, or an admin decides.',
      },
      step: 'cancelled',
      main: { kind: 'viewCase' },
      link: null,
      menu: [],
    });
  });

  it('payment under admin review', () => {
    const view = viewFor({
      job: hired,
      dispute: dispute({ escrow_transactions: { status: 'disputed', amount: 1500 } }),
    });
    expect(view.card.title).toBe('Payment under admin review');
    expect(view.card.body).toBe('The disputed payment stays frozen until an admin resolves it.');
    expect(view.main).toEqual({ kind: 'viewCase' });
  });

  it('any other open complaint: complaint under review', () => {
    const view = viewFor({ job: hired, dispute: dispute() });
    expect(view.card.title).toBe('Complaint under review');
    expect(view.card.body).toBe('An admin is reviewing the complaint.');
    expect(view.main).toEqual({ kind: 'viewCase' });
  });

  it('hired, cancelled, no complaint: refund line, post again, and report a problem in the menu', () => {
    expect(viewFor({ job: hired })).toEqual({
      card: {
        tone: 'closed',
        overline: 'CANCELLED',
        title: 'Job cancelled',
        body: 'Your ₱1,500.00 was returned to your wallet.',
      },
      step: 'cancelled',
      main: { kind: 'postAgain', categoryId: 7 },
      link: null,
      menu: [{ kind: 'reportProblem' }],
    });
  });

  it('hired, cancelled, complaint resolved for the provider: says the payment went to them, case as the link', () => {
    const view = viewFor({
      job: hired,
      dispute: dispute({ status: 'resolved', resolution: 'released_to_provider', resolved_at: at(2026, 9, 8) }),
    });
    expect(view.card.body).toBe('Your ₱1,500.00 was released to the provider.');
    expect(view.main).toEqual({ kind: 'postAgain', categoryId: 7 });
    expect(view.link).toEqual({ kind: 'viewCase' });
    expect(view.menu).toEqual([]);
  });

  it('hired, cancelled, complaint resolved for the client: refund line and case as the link', () => {
    const view = viewFor({
      job: hired,
      dispute: dispute({ status: 'resolved', resolution: 'refunded_to_client', resolved_at: at(2026, 9, 8) }),
    });
    expect(view.card.body).toBe('Your ₱1,500.00 was returned to your wallet.');
    expect(view.link).toEqual({ kind: 'viewCase' });
  });

  it('hired, cancelled, no budget: the refund line does not name an amount', () => {
    const view = viewFor({ job: { ...hired, budget: null } });
    expect(view.card.body).toBe('Your payment was returned to your wallet.');
  });

  it('never hired: providers can no longer apply, post again, nothing in the menu', () => {
    expect(viewFor({ job: { status: 'cancelled' } })).toEqual({
      card: {
        tone: 'closed',
        overline: 'CANCELLED',
        title: 'Job cancelled',
        body: 'Providers can no longer apply.',
      },
      step: 'cancelled',
      main: { kind: 'postAgain', categoryId: 7 },
      link: null,
      menu: [],
    });
  });
});

describe('homeownerJobView: edge cases', () => {
  it('a status this app does not know: a neutral card, no action except a case that exists', () => {
    const view = viewFor({ job: { status: 'mystery' as Job['status'] } });
    expect(view).toEqual({
      card: { tone: 'closed', overline: 'JOB', title: 'Nothing to do here' },
      step: null,
      main: null,
      link: null,
      menu: [],
    });
  });

  it('a pending count is ignored once the job is no longer open', () => {
    const view = viewFor({ job: { status: 'assigned', assigned_provider_id: 'p1' }, pending: 5 });
    expect(view.main).toEqual({ kind: 'message', name: 'TaskBuddyProvider' });
    expect(reachable(view).some((action) => action.kind === 'reviewProposals')).toBe(false);
  });
});

describe('homeownerJobView: permissions match the screen today, in every state', () => {
  const STATUSES = ['open', 'recommending', 'assigned', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'] as const;
  const HOMEOWNER_KINDS = [
    'reviewProposals', 'findProviders', 'message', 'confirmDone', 'reportProblem',
    'viewCase', 'leaveReview', 'postAgain', 'cancelJob',
  ];
  const TASK_SETS = {
    none: [] as JobTask[],
    allDone: [task(true, 0), task(true, 1)],
    someDone: [task(true, 0), task(false, 1)],
  };
  const WARRANTIES = {
    none: null,
    future: new Date(NOW + 2 * DAY).toISOString(),
    past: new Date(NOW - DAY).toISOString(),
  };
  const DISPUTES = {
    none: null,
    open: dispute(),
    cancellationPending: dispute({ cancellation_state: 'pending' }),
    resolved: dispute({ status: 'resolved', resolution: 'reviewed', resolved_at: at(2026, 9, 8) }),
  };

  it('every combination of status, provider, complaint, tasks, warranty, review and proposals', () => {
    const problems: string[] = [];
    let checked = 0;
    for (const status of STATUSES)
      for (const hasProvider of [false, true])
        for (const [disputeKey, d] of Object.entries(DISPUTES))
          for (const [taskKey, tasks] of Object.entries(TASK_SETS))
            for (const [warrantyKey, warranty] of Object.entries(WARRANTIES))
              for (const reviewed of [false, true])
                for (const pending of [0, 2]) {
                  checked += 1;
                  const label = `${status} provider=${hasProvider} dispute=${disputeKey} tasks=${taskKey} warranty=${warrantyKey} reviewed=${reviewed} pending=${pending}`;
                  const j = job({
                    status,
                    assigned_provider_id: hasProvider ? 'p1' : null,
                    job_tasks: tasks,
                    warranty_expires_at: warranty,
                    has_review: reviewed,
                    completed_at: status === 'completed' ? at(2026, 9, 7) : null,
                  });
                  const view = homeownerJobView({
                    job: j,
                    dispute: d,
                    pendingCount: pending,
                    tasks,
                    provider: hasProvider ? PROVIDER : null,
                    now: NOW,
                  });
                  const kinds = reachable(view).map((action) => action.kind);

                  // Today's conditions, copied from HOJobDetailScreen (before this change).
                  const allTasksDone = tasks.length > 0 && tasks.every((t) => t.is_done);
                  const everyTaskDone = tasks.every((t) => t.is_done);
                  const inWarranty = !!warranty && NOW < new Date(warranty).getTime();
                  const canCancel =
                    ['open', 'recommending', 'assigned', 'confirmed', 'in_progress'].includes(status) &&
                    !(status === 'in_progress' && allTasksDone);
                  const canDispute =
                    hasProvider &&
                    (['assigned', 'confirmed', 'in_progress', 'cancelled'].includes(status) ||
                      (status === 'completed' && inWarranty));
                  const canComplete = status === 'in_progress' && everyTaskDone;
                  const canReview = status === 'completed' && hasProvider && !reviewed;
                  const canFindProviders = ['open', 'recommending'].includes(status);
                  const openDispute = d?.status === 'open';
                  const check = (ok: boolean, what: string) => {
                    if (!ok) problems.push(`${label}: ${what}`);
                  };

                  check(kinds.includes('cancelJob') === canCancel, 'cancel must match canCancel');
                  check(kinds.includes('confirmDone') === canComplete, 'confirm must match canComplete');
                  check(kinds.includes('reportProblem') === (canDispute && !d), 'report must match canDispute && !dispute');
                  check(kinds.includes('viewCase') === (d !== null), 'case must be reachable exactly when a dispute exists');
                  check(kinds.includes('leaveReview') === canReview, 'review must match canReview');
                  check(kinds.includes('findProviders') === canFindProviders, 'find providers must match open states');
                  check(
                    kinds.includes('reviewProposals') === (canFindProviders && pending > 0),
                    'review proposals only when open with proposals',
                  );
                  check(
                    kinds.includes('postAgain') === (status === 'expired' || (status === 'cancelled' && !openDispute)),
                    'post again only for expired or closed cancelled jobs',
                  );
                  check(
                    kinds.includes('message') ===
                      (status === 'assigned' || status === 'confirmed' || (status === 'in_progress' && !canComplete)),
                    'message only while the provider is working on or booked for the job',
                  );
                  check(kinds.every((kind) => HOMEOWNER_KINDS.includes(kind)), 'only homeowner actions');
                  check(new Set(kinds).size === kinds.length, 'no action offered twice');
                  check(view.link === null || view.main !== null, 'a link never appears without a main action');
                }

    expect(checked).toBe(STATUSES.length * 2 * 4 * 3 * 3 * 2 * 2);
    expect(problems).toEqual([]);
  });
});
