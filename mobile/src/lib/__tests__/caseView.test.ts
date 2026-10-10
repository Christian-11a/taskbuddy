import { caseView, type CaseDispute, type CaseView } from '../caseView';
import type { DisputeEntry } from '../api';

// Months are zero-based, so 9 is October. Every timestamp is built in local time.
const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).toISOString();
const CREATED = at(6, 18, 59); // Oct 6 · 6:59 PM
const DEADLINE = at(9, 6, 35); // Oct 9 · 6:35 AM
const RESOLVED = at(7, 4, 33); // Oct 7 · 4:33 AM
const BEFORE_DEADLINE = new Date(2026, 9, 7, 9, 0).getTime();
const AFTER_DEADLINE = new Date(2026, 9, 10, 9, 0).getTime();
const CLIENT = 'client';
const PROVIDER = 'provider';

const base: CaseDispute = {
  id: 'case', job_id: 'job', reason: 'Work not completed', details: 'The faucet still leaks after the visit.',
  status: 'open', resolution: null, resolution_note: null, resolved_at: null, created_at: CREATED,
  cancellation_state: null, cancellation_deadline: null, entries: [],
  escrow_transactions: { status: 'disputed', amount: 800 },
  raised_by: 'client', raised_by_profile: { id: 'client', full_name: 'Maria Client' },
  jobs: {
    client_id: 'client', assigned_provider_id: 'provider', title: 'Fix leaking faucet',
    service_categories: { name: 'Plumbing' }, client: { full_name: 'Maria Client' }, provider: { full_name: 'TaskBuddyProvider' },
  },
};

const pending: CaseDispute = {
  ...base, cancellation_state: 'pending', cancellation_deadline: DEADLINE,
  reason: 'Cancellation request before work started',
  details: 'Provider has 48 hours to agree or contest. Money stays held until a response or deadline.',
};

function entry(partial: Pick<DisputeEntry, 'id' | 'kind' | 'body' | 'created_at'> & Partial<DisputeEntry>): DisputeEntry {
  return { author: null, message: null, attachment_url: null, ...partial };
}

const clientAuthor = { id: CLIENT, full_name: 'Maria Client', role: 'homeowner' };
const providerAuthor = { id: PROVIDER, full_name: 'TaskBuddyProvider', role: 'provider' };
const adminAuthor = { id: 'admin', full_name: 'Admin Reviewer', role: 'admin' };

function stepTitles(view: CaseView) {
  return view.steps.map((step) => step.title);
}

describe('caseView: heading and job chip', () => {
  it('titles the case by who raised it', () => {
    expect(caseView(base, CLIENT, BEFORE_DEADLINE).heading).toBe('Your report');
    expect(caseView(base, PROVIDER, BEFORE_DEADLINE).heading).toBe('Report about this job');
    expect(caseView(pending, CLIENT, BEFORE_DEADLINE).heading).toBe('Cancellation request');
  });

  it('builds the job chip from the category, title and held amount', () => {
    expect(caseView(base, CLIENT, BEFORE_DEADLINE).jobChip).toBe('Plumbing: Fix leaking faucet · ₱800.00');
  });

  it('leaves out the category and the amount when they are unknown', () => {
    const view = caseView({ ...base, escrow_transactions: null, jobs: { ...base.jobs!, service_categories: null } }, CLIENT, BEFORE_DEADLINE);
    expect(view.jobChip).toBe('Fix leaking faucet');
  });

  it('has no job chip without a job title', () => {
    expect(caseView({ ...base, jobs: { client_id: 'client', assigned_provider_id: 'provider' } }, CLIENT, BEFORE_DEADLINE).jobChip).toBeNull();
  });
});

describe('caseView: status card', () => {
  it('shows a complaint under review to the client with the held amount', () => {
    expect(caseView(base, CLIENT, BEFORE_DEADLINE).status).toEqual({
      tone: 'attention', overline: 'UNDER REVIEW', title: 'An admin is reviewing your report',
      body: "Your ₱800.00 stays held until it's decided.",
    });
  });

  it('shows the same complaint to the provider as a case about their job', () => {
    expect(caseView(base, PROVIDER, BEFORE_DEADLINE).status).toEqual({
      tone: 'attention', overline: 'UNDER REVIEW', title: 'An admin is reviewing this report',
      body: "The ₱800.00 stays held until it's decided.",
    });
  });

  it('does not claim money is held when the case has no escrow', () => {
    const view = caseView({ ...base, escrow_transactions: null }, CLIENT, BEFORE_DEADLINE);
    expect(view.status).toEqual({ tone: 'attention', overline: 'UNDER REVIEW', title: 'An admin is reviewing your report' });
  });

  it('asks the provider to respond before the deadline, in the navy action card', () => {
    const view = caseView(pending, PROVIDER, BEFORE_DEADLINE);
    expect(view.status).toEqual({
      tone: 'action', overline: 'RESPOND BY OCT 9 · 6:35 AM', title: 'The client wants to cancel',
      body: "If you don't respond in time, the client gets the ₱800.00 back automatically.",
    });
  });

  it('tells the provider the response time has passed', () => {
    expect(caseView(pending, PROVIDER, AFTER_DEADLINE).status).toEqual({
      tone: 'attention', overline: 'RESPONSE TIME ENDED', title: 'The time to respond has passed',
      body: 'The client gets the ₱800.00 back automatically.',
    });
  });

  it('tells the client the provider has until the deadline', () => {
    expect(caseView(pending, CLIENT, BEFORE_DEADLINE).status).toEqual({
      tone: 'attention', overline: 'AWAITING RESPONSE', title: 'Waiting for TaskBuddyProvider to respond',
      body: "If they don't respond by Oct 9 · 6:35 AM, the ₱800.00 goes back to you automatically.",
    });
  });

  it('shows a contested cancellation as under review', () => {
    const contested: CaseDispute = {
      ...base, cancellation_state: 'contested', cancellation_deadline: DEADLINE,
      entries: [entry({ id: 'r', kind: 'cancellation_response', body: 'I completed the work', created_at: at(7, 10, 0), author: providerAuthor })],
    };
    expect(caseView(contested, PROVIDER, BEFORE_DEADLINE).status).toEqual({
      tone: 'attention', overline: 'UNDER REVIEW', title: 'An admin is reviewing this cancellation',
      body: "The ₱800.00 stays held until it's decided.",
    });
  });

  it('closes a refunded complaint with the amount and the admin note', () => {
    const decided: CaseDispute = {
      ...base, status: 'resolved', resolution: 'refunded_to_client', resolution_note: 'Refund approved after review',
      resolved_at: RESOLVED, escrow_transactions: { status: 'refunded', amount: 800 },
    };
    expect(caseView(decided, CLIENT, BEFORE_DEADLINE).status).toEqual({
      tone: 'closed', overline: 'CLOSED · OCT 7', title: '₱800.00 refunded to the client', body: 'Refund approved after review',
    });
  });

  it('closes a released payment as released to the provider', () => {
    const released: CaseDispute = {
      ...base, status: 'resolved', resolution: 'released_to_provider', resolved_at: RESOLVED,
      escrow_transactions: { status: 'released', amount: '800' },
    };
    const view = caseView(released, PROVIDER, BEFORE_DEADLINE);
    expect(view.status.title).toBe('₱800.00 released to the provider');
    expect(view.status.body).toBeUndefined();
  });

  it('closes a reviewed case as reviewed by an admin, with its note', () => {
    const reviewed: CaseDispute = {
      ...base, status: 'resolved', resolution: 'reviewed', resolution_note: 'Documented with both statements', resolved_at: RESOLVED,
    };
    expect(caseView(reviewed, PROVIDER, BEFORE_DEADLINE).status).toEqual({
      tone: 'closed', overline: 'CLOSED · OCT 7', title: 'Reviewed by an admin', body: 'Documented with both statements',
    });
  });

  it('closes an agreed cancellation as cancelled and refunded, for the provider', () => {
    const accepted: CaseDispute = {
      ...base, status: 'resolved', resolution: 'refunded_to_client', resolution_note: 'Test only - agreeing to cancel.',
      resolved_at: RESOLVED, cancellation_state: 'accepted', cancellation_deadline: DEADLINE,
      escrow_transactions: { status: 'refunded', amount: 800 },
      entries: [entry({ id: 'ack', kind: 'cancellation_response', body: 'Test only - agreeing to cancel.', created_at: at(7, 4, 20), author: providerAuthor })],
    };
    expect(caseView(accepted, PROVIDER, BEFORE_DEADLINE).status).toEqual({
      tone: 'closed', overline: 'CLOSED · OCT 7', title: 'Cancelled · ₱800.00 refunded to the client',
      body: 'You agreed to cancel. Nothing more is needed from you.',
    });
  });

  it('names the provider when the client reads an agreed cancellation', () => {
    const accepted: CaseDispute = {
      ...base, status: 'resolved', resolution: 'refunded_to_client', resolved_at: RESOLVED,
      cancellation_state: 'accepted', escrow_transactions: { status: 'refunded', amount: 800 },
      entries: [entry({ id: 'ack', kind: 'cancellation_response', body: 'Agreed', created_at: at(7, 4, 20), author: providerAuthor })],
    };
    const view = caseView(accepted, CLIENT, BEFORE_DEADLINE);
    expect(view.status.body).toBe('TaskBuddyProvider agreed to cancel. Nothing more is needed from you.');
    expect(view.steps[1].title).toBe('TaskBuddyProvider agreed to cancel');
  });

  it('closes an automatic refund with a plain explanation', () => {
    const expired: CaseDispute = {
      ...base, status: 'resolved', resolution: 'refunded_to_client', resolved_at: RESOLVED,
      resolution_note: 'No provider response within 48 hours. Cancellation closed automatically.',
      cancellation_state: 'expired', cancellation_deadline: DEADLINE, escrow_transactions: { status: 'refunded', amount: 800 },
    };
    expect(caseView(expired, CLIENT, BEFORE_DEADLINE).status).toMatchObject({
      tone: 'closed', title: 'Cancelled · ₱800.00 refunded to the client', body: 'No response in time, so the request closed automatically.',
    });
  });

  it('says cancelled, not refunded, when an agreed cancellation had no money held', () => {
    const accepted: CaseDispute = {
      ...base, status: 'resolved', resolution: 'reviewed', resolved_at: RESOLVED, cancellation_state: 'accepted',
      escrow_transactions: null,
    };
    const view = caseView(accepted, PROVIDER, BEFORE_DEADLINE);
    expect(view.status.title).toBe('Cancelled');
    expect(view.status.body).toBe('You agreed to cancel. Nothing more is needed from you.');
  });

  it('says cancelled for an automatic close with no money held', () => {
    const expired: CaseDispute = {
      ...base, status: 'resolved', resolution: 'reviewed', resolved_at: RESOLVED, cancellation_state: 'expired', escrow_transactions: null,
    };
    expect(caseView(expired, CLIENT, BEFORE_DEADLINE).status).toMatchObject({
      title: 'Cancelled', body: 'No response in time, so the request closed automatically.',
    });
  });

  it('drops the amount from a closed decision when it is unknown', () => {
    const refunded: CaseDispute = { ...base, status: 'resolved', resolution: 'refunded_to_client', resolved_at: RESOLVED, escrow_transactions: null };
    expect(caseView(refunded, CLIENT, BEFORE_DEADLINE).status.title).toBe('Refunded to the client');
  });
});

describe('caseView: timeline', () => {
  it('lists the report, the wait for the other side, and the admin decision', () => {
    const view = caseView(base, CLIENT, BEFORE_DEADLINE);
    expect(view.steps.map((step) => [step.state, step.title])).toEqual([
      ['done', 'You reported: Work not completed'],
      ['current', "Waiting for TaskBuddyProvider's side"],
      ['next', 'Admin decides'],
    ]);
    expect(view.steps[0]).toMatchObject({ detail: 'The faucet still leaks after the visit.', meta: 'Oct 6 · 6:59 PM' });
    expect(view.steps[1].detail).toBe('They can add a statement too.');
    expect(view.steps[2].detail).toBe("You'll be notified");
  });

  it('names the reporter for the provider and invites the provider to add a side', () => {
    const view = caseView(base, PROVIDER, BEFORE_DEADLINE);
    expect(stepTitles(view)).toEqual(['Maria Client reported: Work not completed', 'An admin reviews both sides', 'Admin decides']);
    expect(view.steps[1].detail).toBe('You can add your side too.');
  });

  it('moves to both sides once the other party has added details', () => {
    const view = caseView({
      ...base, entries: [entry({ id: 's', kind: 'statement', body: 'Repair is in progress', created_at: at(7, 8, 0), author: providerAuthor })],
    }, CLIENT, BEFORE_DEADLINE);
    expect(stepTitles(view)).toEqual(['You reported: Work not completed', 'TaskBuddyProvider added details', 'An admin reviews both sides', 'Admin decides']);
    expect(view.steps[1]).toMatchObject({ detail: 'Repair is in progress', meta: 'Oct 7 · 8:00 AM' });
    expect(view.steps[2].detail).toBeUndefined();
  });

  it('turns every entry kind into plain words and never shows the raw kind', () => {
    const view = caseView({
      ...base,
      entries: [
        entry({ id: 's1', kind: 'statement', body: 'The faucet was fixed on the second visit', created_at: at(6, 20, 0), author: clientAuthor,
          message: { id: 'm1', body: 'Repair photo', attachment_path: 'photo.jpg' }, attachment_url: 'https://storage.test/photo' }),
        entry({ id: 's2', kind: 'appeal', body: 'Please look again', created_at: at(6, 21, 0), author: providerAuthor,
          message: { id: 'm2', body: '', attachment_path: 'chat.jpg' } }),
        entry({ id: 'c1', kind: 'clarification', body: 'Explain the missing checklist task', created_at: at(6, 22, 0), author: adminAuthor }),
        entry({ id: 'u1', kind: 'future_kind' as DisputeEntry['kind'], body: 'Plain update', created_at: at(6, 23, 0) }),
      ],
    }, CLIENT, BEFORE_DEADLINE);
    expect(view.steps.slice(1, 5)).toMatchObject([
      { state: 'done', title: 'You added details', detail: 'The faucet was fixed on the second visit', meta: 'Oct 6 · 8:00 PM',
        photoUrl: 'https://storage.test/photo', chatNote: 'From the job chat: Repair photo' },
      { state: 'done', title: 'TaskBuddyProvider appealed', detail: 'Please look again', meta: 'Oct 6 · 9:00 PM',
        photoUnavailable: true, chatNote: 'From the job chat: a photo' },
      { state: 'done', title: 'Explain the missing checklist task', meta: 'Admin Reviewer · Oct 6 · 10:00 PM' },
      { state: 'done', title: 'Plain update', meta: 'Oct 6 · 11:00 PM' },
    ]);
    expect(view.steps[5]).toMatchObject({ state: 'current', title: 'An admin reviews both sides' });
    expect(view.steps[5].detail).toBeUndefined();
    expect(view.steps[6]).toMatchObject({ state: 'next', title: 'Admin decides' });
  });

  it('asks the provider to answer a cancellation before the deadline', () => {
    const view = caseView(pending, PROVIDER, BEFORE_DEADLINE);
    expect(view.steps).toEqual([
      expect.objectContaining({ state: 'done', title: 'The client asked to cancel', meta: 'Oct 6 · 6:59 PM' }),
      expect.objectContaining({ state: 'current', title: 'Your answer is needed', detail: 'Agree or contest before the deadline.' }),
      expect.objectContaining({ state: 'next', title: 'Refund or admin review', detail: 'Agreeing refunds the client. Contesting sends it to an admin.' }),
    ]);
  });

  it('shows the client the provider is the one who has to answer', () => {
    const view = caseView(pending, CLIENT, BEFORE_DEADLINE);
    expect(view.steps.map((step) => [step.state, step.title])).toEqual([
      ['done', 'You asked to cancel'],
      ['current', "Waiting for TaskBuddyProvider's answer"],
      ['next', 'Refund or admin review'],
    ]);
    expect(view.steps[1].detail).toBe('They can agree or contest before the deadline.');
  });

  it('stops at the missed answer once the response time has passed', () => {
    expect(stepTitles(caseView(pending, PROVIDER, AFTER_DEADLINE))).toEqual(['The client asked to cancel', 'No answer in time']);
  });

  it('records the provider contest with its note and asks an admin to decide', () => {
    const contested: CaseDispute = {
      ...base, cancellation_state: 'contested', cancellation_deadline: DEADLINE,
      entries: [entry({ id: 'r', kind: 'cancellation_response', body: 'I completed the work', created_at: at(7, 10, 0), author: providerAuthor })],
    };
    const view = caseView(contested, PROVIDER, BEFORE_DEADLINE);
    expect(view.steps.map((step) => [step.state, step.title])).toEqual([
      ['done', 'Cancellation requested'],
      ['done', 'You contested the cancellation'],
      ['current', 'An admin reviews both sides'],
      ['next', 'Admin decides'],
    ]);
    expect(view.steps[1]).toMatchObject({ detail: 'I completed the work', meta: 'Oct 7 · 10:00 AM' });
  });

  it('closes a decided complaint with one decision line, from the admin resolution entry', () => {
    const decided: CaseDispute = {
      ...base, status: 'resolved', resolution: 'refunded_to_client', resolution_note: 'Refund approved after review', resolved_at: RESOLVED,
      escrow_transactions: { status: 'refunded', amount: 800 },
      entries: [entry({ id: 'res', kind: 'resolution', body: 'Refund approved after review', created_at: RESOLVED, author: adminAuthor })],
    };
    const view = caseView(decided, CLIENT, BEFORE_DEADLINE);
    expect(view.steps).toEqual([
      expect.objectContaining({ state: 'done', title: 'You reported: Work not completed' }),
      expect.objectContaining({ state: 'done', title: 'Case closed · ₱800.00 refunded to the client', meta: 'Oct 7 · 4:33 AM' }),
    ]);
    expect(view.steps[1].detail).toBeUndefined();
  });

  it('adds a closing line from the resolved date when no resolution entry exists', () => {
    const released: CaseDispute = {
      ...base, status: 'resolved', resolution: 'released_to_provider', resolved_at: RESOLVED, escrow_transactions: { status: 'released', amount: 800 },
    };
    expect(caseView(released, PROVIDER, BEFORE_DEADLINE).steps[1]).toMatchObject({
      state: 'done', title: 'Case closed · ₱800.00 released to the provider', meta: 'Oct 7 · 4:33 AM',
    });
  });

  it('closes a reviewed case with a lower-case decision line', () => {
    const reviewed: CaseDispute = { ...base, status: 'resolved', resolution: 'reviewed', resolved_at: RESOLVED };
    expect(caseView(reviewed, PROVIDER, BEFORE_DEADLINE).steps[1].title).toBe('Case closed · reviewed by an admin');
  });

  it('tells the story of an agreed cancellation in three steps', () => {
    const accepted: CaseDispute = {
      ...base, status: 'resolved', resolution: 'refunded_to_client', resolved_at: RESOLVED, cancellation_state: 'accepted',
      escrow_transactions: { status: 'refunded', amount: 800 },
      entries: [entry({ id: 'ack', kind: 'cancellation_response', body: 'Test only - agreeing to cancel.', created_at: at(7, 4, 20), author: providerAuthor })],
    };
    expect(caseView(accepted, PROVIDER, BEFORE_DEADLINE).steps).toEqual([
      expect.objectContaining({ state: 'done', title: 'Cancellation requested', meta: 'Oct 6 · 6:59 PM' }),
      expect.objectContaining({ state: 'done', title: 'You agreed to cancel', detail: 'Test only - agreeing to cancel.', meta: 'Oct 7 · 4:20 AM' }),
      expect.objectContaining({ state: 'done', title: 'Case closed · ₱800.00 refunded to the client', meta: 'Oct 7 · 4:33 AM' }),
    ]);
  });

  it('keeps the automatic close message from the system entry as a plain line', () => {
    const expired: CaseDispute = {
      ...base, status: 'resolved', resolution: 'refunded_to_client', resolved_at: RESOLVED, cancellation_state: 'expired',
      escrow_transactions: { status: 'refunded', amount: 800 },
      entries: [entry({ id: 'sys', kind: 'system', body: 'No provider response within 48 hours. Cancellation closed automatically.', created_at: RESOLVED })],
    };
    expect(stepTitles(caseView(expired, CLIENT, BEFORE_DEADLINE))).toEqual([
      'You asked to cancel',
      'No provider response within 48 hours. Cancellation closed automatically.',
      'Case closed · ₱800.00 refunded to the client',
    ]);
  });
});

describe('caseView: actions copy', () => {
  it('asks before agreeing, with the amount that goes back and a refund label', () => {
    const view = caseView(pending, PROVIDER, BEFORE_DEADLINE);
    expect(view.agree).toEqual({
      title: 'Agree to cancel?',
      message: "₱800.00 goes back to the client's wallet.\nThe booking is removed from your schedule.\nThis can't be undone.",
      confirmLabel: 'Agree and refund ₱800.00',
    });
  });

  it('leaves the amount out of the agree copy when it is unknown', () => {
    const view = caseView({ ...pending, escrow_transactions: null }, PROVIDER, BEFORE_DEADLINE);
    expect(view.agree).toEqual({
      title: 'Agree to cancel?',
      message: "The booking is removed from your schedule.\nThis can't be undone.",
      confirmLabel: 'Agree and refund',
    });
  });

  it('asks before contesting, and says the payment stays held', () => {
    expect(caseView(pending, PROVIDER, BEFORE_DEADLINE).contest).toEqual({
      title: 'Contest this cancellation?',
      message: 'An admin will review both sides and decide. The payment stays held until then.',
      confirmLabel: 'Contest',
    });
  });

  it('labels the sheet for adding details or for an appeal', () => {
    expect(caseView(base, CLIENT, BEFORE_DEADLINE).sheetTitle).toBe('Add to your case');
    const closed = caseView({ ...base, status: 'resolved', resolved_at: RESOLVED, resolution: 'reviewed' }, CLIENT, BEFORE_DEADLINE);
    expect(closed.sheetTitle).toBe('Appeal this decision');
    expect(closed.sheetIntro).toBe("An appeal reopens review. It does not reverse payments that were already settled.");
  });

  it('names the other party in the back label and the message link', () => {
    expect(caseView(base, CLIENT, BEFORE_DEADLINE).counterpartName).toBe('TaskBuddyProvider');
    expect(caseView(base, PROVIDER, BEFORE_DEADLINE).counterpartName).toBe('Maria Client');
    expect(caseView({ ...base, status: 'resolved', resolved_at: RESOLVED, resolution: 'reviewed' }, PROVIDER, BEFORE_DEADLINE).closedBackLabel).toBe('Back to My Work');
    expect(caseView({ ...base, status: 'resolved', resolved_at: RESOLVED, resolution: 'reviewed' }, CLIENT, BEFORE_DEADLINE).closedBackLabel).toBe('Back to My Jobs');
  });

  it('gives the provider the reason as "No reason given" for a cancellation, and the reason for a complaint', () => {
    expect(caseView(pending, PROVIDER, BEFORE_DEADLINE).theirReason).toBe('No reason given');
    expect(caseView(base, CLIENT, BEFORE_DEADLINE).theirReason).toBe('Work not completed\nThe faucet still leaks after the visit.');
  });
});

describe('caseView: plain words', () => {
  const RAW_CODES = [
    'refunded_to_client', 'released_to_provider', 'reviewed', 'statement', 'appeal', 'clarification', 'resolution',
    'cancellation_response', 'system', 'pending', 'accepted', 'expired', 'contested',
  ];

  function visibleStrings(view: CaseView): string[] {
    return [
      view.heading, view.jobChip, view.status.overline, view.status.title, view.status.body, view.theirReason,
      view.counterpartName, view.closedBackLabel, view.agree.title, view.agree.message, view.agree.confirmLabel,
      view.contest.title, view.contest.message, view.contest.confirmLabel, view.sheetTitle, view.sheetIntro,
      ...view.steps.flatMap((step) => [step.title, step.detail, step.meta, step.chatNote]),
    ].filter((text): text is string => typeof text === 'string');
  }

  it('never shows a raw code, in any state, to either party', () => {
    const decided: CaseDispute = {
      ...base, status: 'resolved', resolution: 'refunded_to_client', resolved_at: RESOLVED, cancellation_state: 'accepted',
      escrow_transactions: { status: 'refunded', amount: 800 },
      entries: [
        entry({ id: 'ack', kind: 'cancellation_response', body: 'Agreed', created_at: at(7, 4, 20), author: providerAuthor }),
        entry({ id: 'sys', kind: 'system', body: 'Closed automatically.', created_at: RESOLVED }),
        entry({ id: 'res', kind: 'resolution', body: 'Done', created_at: RESOLVED, author: adminAuthor }),
      ],
    };
    const contested: CaseDispute = {
      ...base, cancellation_state: 'contested', cancellation_deadline: DEADLINE,
      entries: [
        entry({ id: 's', kind: 'statement', body: 'Mine', created_at: at(7, 1, 0), author: clientAuthor }),
        entry({ id: 'a', kind: 'appeal', body: 'Theirs', created_at: at(7, 2, 0), author: providerAuthor }),
        entry({ id: 'c', kind: 'clarification', body: 'Question', created_at: at(7, 3, 0), author: adminAuthor }),
      ],
    };
    const views = [
      caseView(base, CLIENT, BEFORE_DEADLINE), caseView(base, PROVIDER, BEFORE_DEADLINE),
      caseView(pending, PROVIDER, BEFORE_DEADLINE), caseView(pending, PROVIDER, AFTER_DEADLINE), caseView(pending, CLIENT, BEFORE_DEADLINE),
      caseView(contested, PROVIDER, BEFORE_DEADLINE), caseView(contested, CLIENT, BEFORE_DEADLINE),
      caseView(decided, CLIENT, BEFORE_DEADLINE), caseView(decided, PROVIDER, BEFORE_DEADLINE),
      caseView({ ...decided, resolution: 'released_to_provider' }, PROVIDER, BEFORE_DEADLINE),
      caseView({ ...decided, resolution: 'reviewed', escrow_transactions: null }, CLIENT, BEFORE_DEADLINE),
    ];
    for (const view of views) {
      for (const text of visibleStrings(view)) {
        expect(text).not.toMatch(/\b[a-z]+(?:_[a-z]+)+\b/);
        expect(RAW_CODES).not.toContain(text);
      }
    }
  });
});
