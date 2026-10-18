import {
  certificateStateFromMe, certificateStateFrom, finishCard, firstNameFrom, introButtons, introCards, tourSteps } from '../tourContent';

describe('firstNameFrom', () => {
  it.each([
    ['Juan Dela Cruz', 'Juan'],
    ['  Ana  ', 'Ana'],
    ['Maria', 'Maria'],
  ])('takes the first word of %p', (name, expected) => {
    expect(firstNameFrom(name)).toBe(expected);
  });

  it.each([[''], ['   '], [null], [undefined]])('falls back to "there" for %p', (name) => {
    expect(firstNameFrom(name)).toBe('there');
  });
});

describe('introCards', () => {
  it('gives the client three cards with the approved copy, greeting by first name', () => {
    expect(introCards('homeowner', 'Juan')).toEqual([
      { title: 'Hi Juan, help is close by', body: 'Book trusted local providers for plumbing, cleaning, repairs and more.' },
      {
        title: 'Compare proposals, then hire',
        body: 'Providers send you proposals. Check their ratings, reviews and price, then hire the one you like.',
      },
      {
        title: 'Your payment waits until the job is done',
        body: 'We hold your payment and release it to the provider only when you confirm the job is done.',
      },
    ]);
  });

  it('gives the provider three cards with the approved copy, greeting by first name', () => {
    expect(introCards('provider', 'Ana')).toEqual([
      { title: "Hi Ana, let's get you hired", body: 'Find jobs near you in the services you offer.' },
      {
        title: 'Get verified, then send proposals',
        body: 'Add your ID, a certificate for your service, and a payout account. Then send a short proposal on any open job near you.',
      },
      {
        title: 'Get paid to GCash, Maya or your bank',
        body: 'When the client confirms the job is done, your pay is sent to your account, minus the platform fee.',
      },
    ]);
  });

  it('names the last-slide buttons per role', () => {
    expect(introButtons('homeowner')).toEqual({ primary: 'Post your first job', secondary: 'Look around first' });
    expect(introButtons('provider')).toEqual({ primary: 'Finish setting up', secondary: 'Look around first' });
  });

  it('never uses the banned words', () => {
    const all = JSON.stringify([introCards('homeowner', 'A'), introCards('provider', 'A'), tourSteps('homeowner'), tourSteps('provider'), tourSteps('provider', false)]);
    expect(all).not.toMatch(/wallet|balance|warranty|offers|\bpros?\b/i);
  });

  it.each(['homeowner', 'provider'] as const)('uses "there" when the %s has no name', (role) => {
    for (const name of ['', '   ', null, undefined]) {
      const titles = introCards(role, name).map((card) => card.title);
      expect(titles.some((title) => title.includes('Hi there,'))).toBe(true);
    }
  });

  it.each(['homeowner', 'provider'] as const)('gives the %s exactly three cards', (role) => {
    expect(introCards(role, 'Juan')).toHaveLength(3);
  });

  it('greets by the first word even when a full name is passed', () => {
    expect(introCards('homeowner', 'Juan Dela Cruz')[0].title).toBe('Hi Juan, help is close by');
  });

  it('never shows a peso amount, so no fake numbers reach the cards', () => {
    for (const role of ['homeowner', 'provider'] as const) {
      for (const card of introCards(role, 'Juan')) {
        expect(`${card.title} ${card.body}`).not.toMatch(/₱|PHP/);
      }
    }
  });
});

describe('tourSteps', () => {
  it('gives the client five steps with the approved copy', () => {
    const steps = tourSteps('homeowner');

    expect(steps.map((step) => step.anchorId)).toEqual(['home.post', 'tab.jobs', 'tab.Messages', 'home.bell', 'tab.Profile']);
    expect(steps.map((step) => [step.title, step.body])).toEqual([
      ['Start here', 'Pick a service and describe the job. It takes about a minute.'],
      ['Your jobs and proposals', 'Proposals, bookings and progress for every job.'],
      ['Chat with your provider', 'Message your provider about each job. Filter by active or finished jobs, or by service.'],
      ['Never miss a proposal', 'We tell you when a provider sends a proposal or your booking changes.'],
      ['Your payments', 'See what you paid and any refunds, month by month, under Profile > Payments.'],
    ]);
  });

  it('gives a verified provider five steps with the approved copy', () => {
    const steps = tourSteps('provider');

    expect(steps.map((step) => step.anchorId)).toEqual(['home.availability', 'home.feed', 'tab.work', 'tab.Messages', 'tab.Profile']);
    expect(steps.map((step) => [step.title, step.body])).toEqual([
      ['Be seen', 'Turn this on to get invited to jobs near you.'],
      ['Open jobs near you', 'Open one to see the price, the platform fee and what you receive, then send a proposal.'],
      ['Your work', 'Proposals, bookings and jobs in progress, all in one place.'],
      ['Chat with your clients', 'Filter by active or finished jobs.'],
      ['Your earnings', 'See what was released to you and what was sent to your account, under Profile > Earnings.'],
    ]);
  });

  it('keeps the same steps for a verified provider, whether or not the flag is passed', () => {
    expect(tourSteps('provider', true)).toEqual(tourSteps('provider'));
  });

  it('gives an unverified provider four steps, starting at the setup card on Home', () => {
    const steps = tourSteps('provider', false);

    expect(steps.map((step) => step.anchorId)).toEqual(['home.setup', 'tab.work', 'tab.Messages', 'tab.Profile']);
    expect(steps.map((step) => [step.title, step.body])).toEqual([
      ['Finish setting up', 'Add your details, your ID, your certificate and a payout account so you can send proposals.'],
      ['Your work', 'Proposals, bookings and jobs in progress, all in one place.'],
      ['Chat with your clients', 'Filter by active or finished jobs.'],
      ['Your earnings', 'See what was released to you and what was sent to your account, under Profile > Earnings.'],
    ]);
  });

  it('never points an unverified provider at a Home control that only a verified provider has', () => {
    const anchors = tourSteps('provider', false).map((step) => step.anchorId);

    expect(anchors.filter((anchorId) => anchorId.startsWith('home.'))).toEqual(['home.setup']);
  });
});

describe('certificateStateFrom', () => {
  it.each([
    [[], 'none'],
    [null, 'none'],
    [[{ status: 'rejected' }, { status: 'expired' }], 'none'],
    [[{ status: 'pending' }], 'pending'],
    [[{ status: 'pending' }, { status: 'approved' }], 'approved'],
  ] as const)('reads %j as %s', (list, expected) => {
    expect(certificateStateFrom(list as never)).toBe(expected);
  });
});

describe('finishCard', () => {
  it('gives the client the three-step checklist, posting first', () => {
    expect(finishCard({ role: 'homeowner', verified: false, firstName: 'Juan' })).toEqual({
      title: "You're all set, Juan",
      checklist: [
        { label: 'Post a job', state: 'next' },
        { label: 'Compare proposals', state: 'later' },
        { label: 'Confirm when the job is done', state: 'later' },
      ],
      primary: { label: 'Post your first job', action: 'postJob' },
      secondary: { label: 'Look around first', action: 'close' },
    });
  });

  it('gives a provider with nothing done five steps, address first', () => {
    const card = finishCard({
      role: 'provider', verified: false, firstName: 'Ana', hasAddress: false, hasBio: false, certificate: 'none', hasPayoutAccount: false,
    });

    expect(card.checklist).toEqual([
      { label: 'Add your address', state: 'next' },
      { label: 'Add a short bio', state: 'later' },
      { label: 'Verify your ID', state: 'later' },
      { label: 'Upload your certificate', state: 'later' },
      { label: 'Link a payout account', state: 'later' },
    ]);
    expect(card.primary).toEqual({ label: 'Finish setting up', action: 'setupProfile' });
    expect(card.secondary).toEqual({ label: 'Look around first', action: 'close' });
  });

  it('points the main action at the first step not done', () => {
    const base = { role: 'provider' as const, firstName: 'Ana' };
    expect(finishCard({ ...base, verified: false }).primary.action).toBe('getVerified');
    expect(finishCard({ ...base, verified: true, certificate: 'none' }).primary.action).toBe('uploadCertificate');
    expect(finishCard({ ...base, verified: true, certificate: 'unknown' }).primary.action).toBe('uploadCertificate');
    expect(finishCard({ ...base, verified: true, hasPayoutAccount: false }).primary.action).toBe('linkPayout');
    expect(finishCard({ ...base, verified: false, hasBio: false }).primary.action).toBe('setupProfile');
  });

  it('counts a pending certificate as done and says it is waiting for review', () => {
    const card = finishCard({ role: 'provider', verified: true, firstName: 'Ana', certificate: 'pending' });

    expect(card.checklist[3]).toEqual({ label: 'Upload your certificate', state: 'done', note: 'Waiting for review' });
  });

  it('counts an approved certificate as done with no note', () => {
    const card = finishCard({ role: 'provider', verified: true, firstName: 'Ana', certificate: 'approved' });

    expect(card.checklist[3]).toEqual({ label: 'Upload your certificate', state: 'done' });
  });

  it('sends a provider with everything done to their first job, with no second button', () => {
    const card = finishCard({ role: 'provider', verified: true, firstName: 'Ana' });

    expect(card.checklist.every((item) => item.state === 'done')).toBe(true);
    expect(card.primary).toEqual({ label: 'Find my first job', action: 'close' });
    expect(card.secondary).toBeUndefined();
  });

  it('leaves the payout step neutral when the lookup failed: not ticked, not next', () => {
    const card = finishCard({ role: 'provider', verified: true, firstName: 'Ana', hasPayoutAccount: null });

    expect(card.checklist[4]).toEqual({ label: 'Link a payout account', state: 'later' });
    expect(card.primary.action).toBe('close');
  });

  it('greets "there" when the name is missing', () => {
    expect(finishCard({ role: 'homeowner', verified: false, firstName: '' }).title).toBe("You're all set, there");
  });

  it('never offers a client the provider actions, nor a provider the client action', () => {
    const client = finishCard({ role: 'homeowner', verified: true, firstName: 'Juan' });
    const provider = finishCard({ role: 'provider', verified: false, firstName: 'Ana' });

    expect([client.primary.action, client.secondary?.action]).not.toContain('getVerified');
    expect([provider.primary.action, provider.secondary?.action]).not.toContain('postJob');
  });
});

describe('certificateStateFromMe', () => {
  it('reads the verification status when it has a certificate', () => {
    expect(certificateStateFromMe({ certificate: 'approved' }, [])).toBe('approved');
    expect(certificateStateFromMe({ certificate: 'pending' }, [{ status: 'approved' }])).toBe('pending');
    expect(certificateStateFromMe({ certificate: 'expired' }, [{ status: 'approved' }])).toBe('none');
    expect(certificateStateFromMe({ certificate: 'rejected' }, [])).toBe('none');
  });
  it('falls back to the credentials list on the old API', () => {
    expect(certificateStateFromMe({}, [{ status: 'approved' }])).toBe('approved');
    expect(certificateStateFromMe(null, [{ status: 'pending' }])).toBe('pending');
    expect(certificateStateFromMe(null, null)).toBe('none');
  });
});
