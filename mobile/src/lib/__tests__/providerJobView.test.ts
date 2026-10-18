import type { Dispute, Job, JobTask } from '../api';
import { proposeBlockFor, providerJobView, type ProviderApplication, type ProviderJobViewInput } from '../providerJobView';

const NOW = new Date('2026-10-09T10:00:00.000Z');
const ME = { id: 'me' };
const DAY_MS = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString();
// Noon UTC keeps the calendar day the same in every time zone from UTC-11 to UTC+11.
const noon = (iso: string) => iso.replace(/T.*$/, 'T12:00:00.000Z');

function makeJob(fields: Partial<Job> & Pick<Job, 'status'>): Job {
  return {
    id: 'job-1',
    client_id: 'client',
    category_id: 1,
    title: 'Fix the sink',
    description: 'Leaky kitchen sink',
    urgency: 'normal',
    address: '123 Main St',
    latitude: 14.6,
    longitude: 121,
    provider_accept_address: null,
    provider_accept_latitude: null,
    provider_accept_longitude: null,
    posted_at: at(-3),
    assigned_provider_id: null,
    assigned_at: null,
    completed_at: null,
    budget: 500,
    scheduled_at: null,
    photo_urls: [],
    created_at: at(-3),
    job_tasks: [],
    ...fields,
  } as Job;
}

function makeApplication(status: ProviderApplication['status'], fields: Partial<ProviderApplication> = {}): ProviderApplication {
  return {
    id: 'app-1',
    status,
    applied_at: at(-1),
    decided_at: null,
    cover_message: 'I can start tomorrow.',
    ...fields,
  };
}

function makeDispute(fields: Partial<Dispute> = {}): Dispute {
  return {
    id: 'dispute-1',
    job_id: 'job-1',
    reason: 'Work not finished',
    cancellation_state: null,
    cancellation_deadline: null,
    details: null,
    status: 'open',
    resolution: null,
    resolution_note: null,
    resolved_at: null,
    created_at: at(-1),
    escrow_transactions: null,
    ...fields,
  } as Dispute;
}

function task(id: string, isDone: boolean, position = 0): JobTask {
  return { id, label: `Task ${id}`, position, is_done: isDone, completed_at: isDone ? at(-1) : null };
}

/** The view for one job, with sensible defaults for everything the caller did not set. */
function view(
  job: Partial<Job> & Pick<Job, 'status'>,
  extra: Partial<Omit<ProviderJobViewInput, 'job'>> = {},
) {
  return providerJobView({
    job: makeJob(job),
    me: ME,
    myApplication: null,
    dispute: null,
    tasks: [],
    isVerified: true,
    now: NOW,
    ...extra,
  });
}

const MONEY_LINE_BOOKED =
  "The client already paid ₱500.00. It's held safely and released to you as soon as the client confirms the job is done.";

describe('providerJobView: a job I have not applied to', () => {
  it('verified provider sees NEW JOB with Send proposal as the only action', () => {
    const result = view({ status: 'open', scheduled_at: noon(at(5)) });
    expect(result.card.tone).toBe('action');
    expect(result.card.overline).toBe('NEW JOB');
    expect(result.card.title).toMatch(/^Client wants this done by .*Oct 14$/);
    expect(result.card.body).toBe('Send a proposal. The client compares proposals and hires one provider.');
    expect(result.step).toBeNull();
    expect(result.main).toEqual({ kind: 'sendProposal' });
    expect(result.link).toBeNull();
    expect(result.menu).toEqual([]);
  });

  it('no scheduled date reads as needed as soon as possible', () => {
    const result = view({ status: 'open', scheduled_at: null });
    expect(result.card.title).toBe('Client needs this as soon as possible');
    expect(result.main).toEqual({ kind: 'sendProposal' });
  });

  it('a recommended job (status recommending) can be applied to like an open job', () => {
    const result = view({ status: 'recommending' });
    expect(result.card.overline).toBe('NEW JOB');
    expect(result.main).toEqual({ kind: 'sendProposal' });
  });

  it('a job without a budget can still be applied to', () => {
    const result = view({ status: 'open', budget: null });
    expect(result.card.overline).toBe('NEW JOB');
    expect(result.main).toEqual({ kind: 'sendProposal' });
  });

  it('unverified provider sees VERIFY FIRST with Verify to apply as the main action', () => {
    const result = view({ status: 'open' }, { isVerified: false });
    expect(result.card).toEqual({
      tone: 'attention',
      overline: 'VERIFY FIRST',
      title: 'Get verified to apply',
      body: 'Verify your ID to send proposals.',
    });
    expect(result.step).toBeNull();
    expect(result.main).toEqual({ kind: 'getVerified' });
    expect(result.link).toBeNull();
    expect(result.menu).toEqual([]);
  });

  it('an unverified provider who already applied sees the proposal, not the verify prompt', () => {
    const result = view({ status: 'open' }, { isVerified: false, myApplication: makeApplication('pending') });
    expect(result.card.overline).toBe('WAITING FOR CLIENT');
    expect(result.main).toEqual({ kind: 'findJobs' });
  });

  it('a job taken by another provider, never applied to, is closed with Find similar jobs', () => {
    const result = view({ status: 'confirmed', assigned_provider_id: 'other' });
    expect(result.card).toEqual({
      tone: 'closed',
      overline: 'CLOSED',
      title: 'This job is no longer open',
      body: 'The client has chosen a provider.',
    });
    expect(result.step).toBeNull();
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toBeNull();
    expect(result.menu).toEqual([]);
  });

  it('an expired job I never applied to is EXPIRED with Find similar jobs', () => {
    const result = view({ status: 'expired' });
    expect(result.card).toEqual({
      tone: 'closed',
      overline: 'EXPIRED',
      title: 'This job expired',
      body: 'No one was hired before it expired.',
    });
    expect(result.main).toEqual({ kind: 'findJobs' });
  });

  it('a cancelled job I never applied to is CANCELLED with Find similar jobs', () => {
    const result = view({ status: 'cancelled' });
    expect(result.card).toEqual({ tone: 'closed', overline: 'CANCELLED', title: 'This job was cancelled' });
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.step).toBeNull();
  });
});

describe('providerJobView: my proposal on a job that is still open', () => {
  it('pending proposal shows WAITING FOR CLIENT, the posted step, Find more jobs and a Withdraw link', () => {
    const result = view({ status: 'open' }, { myApplication: makeApplication('pending') });
    expect(result.card).toEqual({
      tone: 'attention',
      overline: 'WAITING FOR CLIENT',
      title: 'Your proposal is in',
      body: "The client is comparing proposals. We'll notify you the moment they decide.",
    });
    expect(result.step).toBe('posted');
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toEqual({ kind: 'withdrawProposal' });
    expect(result.menu).toEqual([]);
  });

  it('pending proposal on a recommending job is still waiting', () => {
    const result = view({ status: 'recommending' }, { myApplication: makeApplication('pending') });
    expect(result.card.overline).toBe('WAITING FOR CLIENT');
    expect(result.link).toEqual({ kind: 'withdrawProposal' });
  });

  it('a rejected proposal reads NOT ACCEPTED with no step and Find similar jobs', () => {
    const result = view({ status: 'open' }, { myApplication: makeApplication('rejected', { decided_at: at(-1) }) });
    expect(result.card.tone).toBe('closed');
    expect(result.card.overline).toMatch(/^NOT ACCEPTED · /);
    expect(result.card.title).toBe("Your proposal wasn't accepted");
    expect(result.card.body).toBe('That happens. Similar jobs near you are open right now.');
    expect(result.step).toBeNull();
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toBeNull();
    expect(result.menu).toEqual([]);
  });

  it('the NOT ACCEPTED overline carries the day the client decided', () => {
    const result = view(
      { status: 'confirmed', assigned_provider_id: 'other' },
      { myApplication: makeApplication('rejected', { decided_at: noon(at(-3)) }) },
    );
    expect(result.card.overline).toMatch(/^NOT ACCEPTED · [A-Z]{3} \d{1,2}$/);
  });

  it('a withdrawn proposal reads WITHDRAWN and offers no second Withdraw', () => {
    const result = view({ status: 'open' }, { myApplication: makeApplication('withdrawn') });
    expect(result.card).toEqual({ tone: 'closed', overline: 'WITHDRAWN', title: 'You withdrew this proposal' });
    expect(result.step).toBeNull();
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toBeNull();
  });

  it('a pending proposal on a job another provider was hired for reads NOT ACCEPTED', () => {
    const result = view(
      { status: 'confirmed', assigned_provider_id: 'other' },
      { myApplication: makeApplication('pending') },
    );
    expect(result.card.overline).toMatch(/^NOT ACCEPTED/);
    expect(result.card.title).toBe("Your proposal wasn't accepted");
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toBeNull();
  });

  it('a pending proposal on a cancelled job reads CANCELLED and offers no Withdraw', () => {
    const result = view({ status: 'cancelled' }, { myApplication: makeApplication('pending') });
    expect(result.card).toEqual({ tone: 'closed', overline: 'CANCELLED', title: 'This job was cancelled' });
    expect(result.step).toBeNull();
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toBeNull();
  });

  it('a pending proposal on an expired job reads EXPIRED and offers no Withdraw', () => {
    const result = view({ status: 'expired' }, { myApplication: makeApplication('pending') });
    expect(result.card).toEqual({
      tone: 'closed',
      overline: 'EXPIRED',
      title: 'This job expired',
      body: 'No one was hired before it expired.',
    });
    expect(result.link).toBeNull();
  });

  it('an accepted proposal on a job that is not mine falls back to a closed card', () => {
    const result = view({ status: 'open' }, { myApplication: makeApplication('accepted') });
    expect(result.card.tone).toBe('closed');
    expect(result.card.overline).toBe('CLOSED');
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toBeNull();
  });
});

describe('providerJobView: a job hired to me', () => {
  it.each(['assigned', 'confirmed'] as const)('%s: BOOKED with Start job and the decline link', (status) => {
    const result = view({ status, assigned_provider_id: ME.id, scheduled_at: noon(at(5)) });
    expect(result.card.tone).toBe('booked');
    expect(result.card.overline).toMatch(/^BOOKED · [A-Z][A-Z]{2}, [A-Z]{3} \d{1,2}$/);
    expect(result.card.title).toBe('Go to 123 Main St');
    expect(result.card.body).toMatch(/^.+\. The client already paid ₱500\.00\. It's held safely/);
    expect(result.step).toBe('hired');
    expect(result.main).toEqual({ kind: 'startJob' });
    expect(result.link).toEqual({ kind: 'declineBooking' });
    expect(result.menu).toEqual([{ kind: 'reportProblem' }]);
  });

  it('a booking with no scheduled date says BOOKED with no date or time', () => {
    const result = view({ status: 'confirmed', assigned_provider_id: ME.id, scheduled_at: null });
    expect(result.card.overline).toBe('BOOKED');
    expect(result.card.body).toBe(MONEY_LINE_BOOKED);
  });

  it('a booking with no budget makes no payment claim', () => {
    const result = view({ status: 'confirmed', assigned_provider_id: ME.id, scheduled_at: null, budget: null });
    expect(result.card.body).toBeUndefined();
    expect(result.main).toEqual({ kind: 'startJob' });
  });

  it('a booking with a zero budget makes no payment claim either', () => {
    const result = view({ status: 'confirmed', assigned_provider_id: ME.id, scheduled_at: null, budget: 0 });
    expect(result.card.body).toBeUndefined();
  });

  it('working with tasks left shows Tick tasks, the working step, Message client and report', () => {
    const result = view(
      { status: 'in_progress', assigned_provider_id: ME.id, job_tasks: [task('a', true), task('b', false, 1)] },
      { tasks: [task('a', true), task('b', false, 1)] },
    );
    expect(result.card.tone).toBe('booked');
    expect(result.card.overline).toBe('WORKING');
    expect(result.card.title).toBe('Tick tasks as you finish them');
    expect(result.card.body).toBe(
      'When all are ticked, the client is asked to confirm. Payment is released as soon as the client confirms.',
    );
    expect(result.step).toBe('working');
    expect(result.main).toEqual({ kind: 'message', name: 'client' });
    expect(result.link).toBeNull();
    expect(result.menu).toEqual([{ kind: 'reportProblem' }]);
  });

  it('working with every task ticked waits for the client', () => {
    const tasks = [task('a', true), task('b', true, 1)];
    const result = view({ status: 'in_progress', assigned_provider_id: ME.id, job_tasks: tasks }, { tasks });
    expect(result.card.title).toBe('Waiting for client to confirm completion');
    expect(result.card.body).toBe('All tasks are ticked. Payment is released as soon as the client confirms.');
    expect(result.main).toEqual({ kind: 'message', name: 'client' });
  });

  it('working with no checklist says Work in progress', () => {
    const result = view({ status: 'in_progress', assigned_provider_id: ME.id, job_tasks: [] }, { tasks: [] });
    expect(result.card.title).toBe('Work in progress');
    expect(result.card.body).toBe(
      'When the work is done, the client is asked to confirm. Payment is released as soon as the client confirms.',
    );
  });

  it('completed: DONE, no release line, View in wallet and no report option', () => {
    const result = view({
      status: 'completed',
      assigned_provider_id: ME.id,
      completed_at: noon(at(-2)),
    });
    expect(result.card.tone).toBe('done');
    expect(result.card.overline).toMatch(/^DONE · [A-Z]{3} \d{1,2}$/);
    expect(result.card.title).toBe('Nice work! Your payment is on its way');
    expect(result.card.body).toBeUndefined();
    expect(result.step).toBe('done');
    expect(result.main).toEqual({ kind: 'viewWallet' });
    expect(result.link).toBeNull();
    expect(result.menu).toEqual([]);
  });

  it('completed with an old warranty date: no warranty line and no report option', () => {
    const result = view({
      status: 'completed',
      assigned_provider_id: ME.id,
      completed_at: noon(at(-6)),
      warranty_expires_at: noon(at(-3)),
    });
    expect(result.card.title).toBe('Nice work! Your payment is on its way');
    expect(result.card.body).toBeUndefined();
    expect(result.menu).toEqual([]);
    expect(result.main).toEqual({ kind: 'viewWallet' });
  });

  it('completed with a future legacy warranty date still shows no release line and no report', () => {
    const result = view({ status: 'completed', assigned_provider_id: ME.id, warranty_expires_at: noon(at(1)) });
    expect(result.card.body).toBeUndefined();
    expect(result.menu).toEqual([]);
  });

  it('completed with no budget does not promise a payment', () => {
    const result = view({
      status: 'completed',
      assigned_provider_id: ME.id,
      budget: null,
      warranty_expires_at: noon(at(1)),
    });
    expect(result.card.title).toBe('Nice work! This job is complete');
    expect(result.card.body).toBeUndefined();
  });

  it('cancelled by the client with a pending cancellation: The client asked to cancel, with the 48-hour window', () => {
    const result = view(
      { status: 'cancelled', assigned_provider_id: ME.id },
      { dispute: makeDispute({ cancellation_state: 'pending', cancellation_deadline: at(2) }) },
    );
    expect(result.card.tone).toBe('closed');
    expect(result.card.overline).toBe('CANCELLED');
    expect(result.card.title).toBe('The client asked to cancel');
    expect(result.card.body).toMatch(/^Agree or contest by [A-Z][a-z]{2} \d{1,2}, .+\. No response refunds the client\.$/);
    expect(result.step).toBe('cancelled');
    expect(result.main).toEqual({ kind: 'viewCase' });
    expect(result.link).toBeNull();
    expect(result.menu).toEqual([]);
  });

  it('a pending cancellation without a deadline still states the 48-hour window', () => {
    const result = view(
      { status: 'cancelled', assigned_provider_id: ME.id },
      { dispute: makeDispute({ cancellation_state: 'pending', cancellation_deadline: null }) },
    );
    expect(result.card.body).toBe('Agree or contest within 48 hours. No response refunds the client.');
  });

  it('cancelled with a payment under admin review says so', () => {
    const result = view(
      { status: 'cancelled', assigned_provider_id: ME.id },
      { dispute: makeDispute({ cancellation_state: 'contested', escrow_transactions: { status: 'disputed', amount: 500 } }) },
    );
    expect(result.card.title).toBe('Payment under admin review');
    expect(result.main).toEqual({ kind: 'viewCase' });
  });

  it('cancelled with an open complaint says it is awaiting admin review', () => {
    const result = view(
      { status: 'cancelled', assigned_provider_id: ME.id },
      { dispute: makeDispute({ cancellation_state: null, escrow_transactions: null }) },
    );
    expect(result.card.title).toBe('Complaint awaiting admin review');
    expect(result.main).toEqual({ kind: 'viewCase' });
  });

  it('cancelled and closed with no complaint: This job was cancelled, Find similar jobs, and the report option', () => {
    const result = view({ status: 'cancelled', assigned_provider_id: ME.id });
    expect(result.card).toEqual({ tone: 'closed', overline: 'CANCELLED', title: 'This job was cancelled' });
    expect(result.step).toBe('cancelled');
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toBeNull();
    expect(result.menu).toEqual([{ kind: 'reportProblem' }]);
  });

  it('cancelled with a closed complaint: View Complaint Status as the link, not the report option', () => {
    const result = view(
      { status: 'cancelled', assigned_provider_id: ME.id },
      { dispute: makeDispute({ status: 'resolved', resolution: 'reviewed', resolved_at: at(-1) }) },
    );
    expect(result.card.title).toBe('This job was cancelled');
    expect(result.main).toEqual({ kind: 'findJobs' });
    expect(result.link).toEqual({ kind: 'viewCase' });
    expect(result.menu).toEqual([]);
  });
});

describe('providerJobView: complaints on a hired job, by state', () => {
  const dispute = (fields: Partial<Dispute> = {}) => makeDispute(fields);

  it('open complaint on a booked job: under review, Start job stays, View Complaint Status in the menu', () => {
    const result = view(
      { status: 'confirmed', assigned_provider_id: ME.id },
      { dispute: dispute({ escrow_transactions: null }) },
    );
    expect(result.card).toEqual({ tone: 'attention', overline: 'UNDER REVIEW', title: 'Complaint awaiting admin review' });
    expect(result.step).toBe('hired');
    expect(result.main).toEqual({ kind: 'startJob' });
    expect(result.link).toEqual({ kind: 'declineBooking' });
    expect(result.menu).toEqual([{ kind: 'viewCase' }]);
  });

  it('open payment review on a working job: under review, Message client stays, View Complaint Status in the menu', () => {
    const result = view(
      { status: 'in_progress', assigned_provider_id: ME.id },
      { dispute: dispute({ escrow_transactions: { status: 'disputed', amount: 500 } }) },
    );
    expect(result.card.title).toBe('Payment under admin review');
    expect(result.card.overline).toBe('UNDER REVIEW');
    expect(result.main).toEqual({ kind: 'message', name: 'client' });
    expect(result.menu).toEqual([{ kind: 'viewCase' }]);
  });

  it('open complaint on a completed job does not promise a payment, and Wallet stays main', () => {
    const result = view(
      { status: 'completed', assigned_provider_id: ME.id, warranty_expires_at: noon(at(1)) },
      { dispute: dispute({ escrow_transactions: { status: 'disputed', amount: 500 } }) },
    );
    expect(result.card.tone).toBe('attention');
    expect(result.card.title).toBe('Payment under admin review');
    expect(result.card.title).not.toMatch(/on its way/);
    expect(result.main).toEqual({ kind: 'viewWallet' });
    expect(result.menu).toEqual([{ kind: 'viewCase' }]);
  });

  it('a resolved complaint leaves the normal card and offers View Complaint Status in the menu', () => {
    const result = view(
      { status: 'completed', assigned_provider_id: ME.id, warranty_expires_at: noon(at(-3)) },
      { dispute: dispute({ status: 'resolved', resolution: 'released_to_provider', resolved_at: at(-1) }) },
    );
    expect(result.card.tone).toBe('done');
    expect(result.card.overline).toMatch(/^DONE/);
    expect(result.menu).toEqual([{ kind: 'viewCase' }]);
  });

  it('a complaint on a completed job still offers View Complaint Status', () => {
    const result = view(
      { status: 'completed', assigned_provider_id: ME.id, warranty_expires_at: noon(at(-3)) },
      { dispute: dispute({ status: 'resolved' }) },
    );
    expect(result.menu).toEqual([{ kind: 'viewCase' }]);
  });

  it('a complaint on a job that is not mine is ignored', () => {
    const result = view(
      { status: 'open' },
      { dispute: dispute({ status: 'open', escrow_transactions: { status: 'disputed', amount: 500 } }) },
    );
    expect(result.card.overline).toBe('NEW JOB');
    expect(result.menu).toEqual([]);
  });
});

describe('providerJobView: edge cases', () => {
  it('no signed-in profile counts as not mine, so a hired job reads as closed', () => {
    const result = view({ status: 'in_progress', assigned_provider_id: ME.id }, { me: null });
    expect(result.card.overline).toBe('CLOSED');
    expect(result.main).toEqual({ kind: 'findJobs' });
  });

  it('a job that expired after I was hired shows EXPIRED and only the complaint option when disputed', () => {
    const plain = view({ status: 'expired', assigned_provider_id: ME.id });
    expect(plain.card.overline).toBe('EXPIRED');
    expect(plain.main).toEqual({ kind: 'findJobs' });
    expect(plain.menu).toEqual([]);

    const disputed = view(
      { status: 'expired', assigned_provider_id: ME.id },
      { dispute: makeDispute({ status: 'resolved' }) },
    );
    expect(disputed.menu).toEqual([{ kind: 'viewCase' }]);
  });

  it('the step is null whenever the provider has not been hired', () => {
    expect(view({ status: 'open' }).step).toBeNull();
    expect(view({ status: 'open' }, { isVerified: false }).step).toBeNull();
    expect(view({ status: 'open' }, { myApplication: makeApplication('rejected') }).step).toBeNull();
    expect(view({ status: 'confirmed', assigned_provider_id: 'other' }).step).toBeNull();
  });
});

describe('providerJobView while disputed', () => {
  it('hides decline, adds the case banner', () => {
    const v = view({ status: 'confirmed', assigned_provider_id: ME.id, display_status: 'disputed' });
    expect(v.link).toBeNull();
    expect(v.banner).toEqual({ text: 'A complaint is open. An admin is reviewing it.', action: { kind: 'viewCase' } });
  });

  it('turns the status card amber with a COMPLAINT OPEN overline', () => {
    const v = view({ status: 'confirmed', assigned_provider_id: ME.id, display_status: 'disputed' });
    expect(v.card.tone).toBe('attention');
    expect(v.card.overline).toBe('COMPLAINT OPEN');
  });

  it('hides Start job as well, so a complaint open on a booked job leaves no start action', () => {
    const v = view({ status: 'confirmed', assigned_provider_id: ME.id, display_status: 'disputed' });
    expect(v.main).toBeNull();
    expect(v.link).toBeNull();
  });

  it('keeps Start job when the job is booked and no complaint is open', () => {
    const v = view({ status: 'confirmed', assigned_provider_id: ME.id });
    expect(v.main).toEqual({ kind: 'startJob' });
  });

  it('a complaint on a working job leaves Message client in place', () => {
    const v = view({ status: 'in_progress', assigned_provider_id: ME.id, display_status: 'disputed' });
    expect(v.main).toEqual({ kind: 'message', name: 'client' });
  });

  it('keeps decline and no banner otherwise', () => {
    const v = view({ status: 'confirmed', assigned_provider_id: ME.id });
    expect(v.link).toEqual({ kind: 'declineBooking' });
    expect(v.banner).toBeUndefined();
  });
});

describe('proposeBlockFor and the certificate card', () => {
  const me = (identity: string, services: { category_id: number; certificate: string }[]) =>
    ({ status: 'approved', identity, certificate: 'none', verified: false, services } as never);

  it('lets a secondary-only provider propose on that service, not on the primary', () => {
    const v = me('approved', [{ category_id: 1, certificate: 'none' }, { category_id: 2, certificate: 'approved' }]);
    expect(proposeBlockFor(v, false, 2)).toBeNull();
    expect(proposeBlockFor(v, false, 1)).toBe('certificate');
  });
  it('names the ID when it is missing, and falls back to isVerified when the lookup failed', () => {
    expect(proposeBlockFor(me('none', [{ category_id: 2, certificate: 'approved' }]), false, 2)).toBe('identity');
    expect(proposeBlockFor(null, true, 2)).toBeNull();
    expect(proposeBlockFor(null, false, 2)).toBe('identity');
  });
  it('shows the certificate card with the service named and a main action for that category', () => {
    const result = view({ status: 'open', category_id: 2 }, { proposeBlock: 'certificate', serviceName: 'Cleaning' });
    expect(result.card.body).toBe('Upload your Cleaning certificate to send proposals for this job.');
    expect(result.main).toEqual({ kind: 'getVerified', categoryId: 2 });
  });
});
