import { finishCard, firstNameFrom, introCards, tourSteps } from '../tourContent';

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
      { title: 'Hi Juan, help is close by', body: 'Book trusted local pros for plumbing, cleaning, repairs and more.' },
      { title: 'You choose who comes', body: 'Pros send you offers. Compare ratings and reviews, then hire one.' },
      {
        title: 'Your money waits until the job is done',
        body: 'We hold your payment safely and release it after the work, with a 3-day warranty.',
      },
    ]);
  });

  it('gives the provider three cards with the approved copy, greeting by first name', () => {
    expect(introCards('provider', 'Ana')).toEqual([
      { title: "Hi Ana, let's get you hired", body: 'Find jobs near you in the services you offer.' },
      { title: 'Send an offer, get booked', body: 'Clients compare offers. When one hires you, the booking is confirmed for you.' },
      {
        title: 'Get paid safely',
        body: "The client's payment is held and released to you after the job and a 3-day warranty.",
      },
    ]);
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
  it('points the client at the post field, Jobs tab, wallet chip and bell, in order', () => {
    const steps = tourSteps('homeowner');

    expect(steps.map((step) => step.anchorId)).toEqual(['home.post', 'tab.jobs', 'home.wallet', 'home.bell']);
    expect(steps[0]).toEqual({ anchorId: 'home.post', title: 'Start here', body: 'Pick a service and describe the job. It takes about a minute.' });
    expect(steps[3].title).toBe('Never miss an offer');
  });

  it('points the provider at the availability toggle, feed search, My Work tab and Wallet tab, in order', () => {
    const steps = tourSteps('provider');

    expect(steps.map((step) => step.anchorId)).toEqual(['home.availability', 'home.feed', 'tab.work', 'tab.Wallet']);
    expect(steps[0]).toEqual({ anchorId: 'home.availability', title: 'Be seen', body: 'Turn this on to get invited to jobs near you.' });
  });

  it('describes withdrawals only as GCash or bank, the two rails the app offers', () => {
    const wallet = tourSteps('provider')[3];

    expect(wallet.body).toBe('Withdraw to your GCash or bank account once money is released.');
    expect(wallet.body).not.toMatch(/Maya/);
  });

  it('gives every step a title and a body', () => {
    for (const role of ['homeowner', 'provider'] as const) {
      for (const step of tourSteps(role)) {
        expect(step.title.trim()).not.toBe('');
        expect(step.body.trim()).not.toBe('');
      }
    }
  });
});

describe('finishCard', () => {
  it('shows the client a finished account and a first post as the next step', () => {
    expect(finishCard({ role: 'homeowner', verified: false, firstName: 'Juan' })).toEqual({
      title: "You're all set, Juan",
      checklist: [
        { label: 'Account created', state: 'done' },
        { label: 'Post your first job', state: 'next' },
        { label: 'Hire a pro', state: 'later' },
      ],
      primary: { label: 'Post my first job', action: 'postJob' },
      secondary: { label: 'Look around first', action: 'close' },
    });
  });

  it('asks an unverified provider to get verified first, with a way to look around', () => {
    expect(finishCard({ role: 'provider', verified: false, firstName: 'Ana' })).toEqual({
      title: "You're all set, Ana",
      checklist: [
        { label: 'Account created', state: 'done' },
        { label: 'Get verified', state: 'next' },
        { label: 'Send your first offer', state: 'later' },
      ],
      primary: { label: 'Get verified', action: 'getVerified' },
      secondary: { label: 'Look around first', action: 'close' },
    });
  });

  it('sends a verified provider to their first job, with no second button', () => {
    expect(finishCard({ role: 'provider', verified: true, firstName: 'Ana' })).toEqual({
      title: "You're all set, Ana",
      checklist: [
        { label: 'Account created', state: 'done' },
        { label: 'Get verified', state: 'done' },
        { label: 'Send your first offer', state: 'next' },
      ],
      primary: { label: 'Find my first job', action: 'close' },
    });
  });

  it('greets "there" when the name is missing', () => {
    expect(finishCard({ role: 'homeowner', verified: false, firstName: '' }).title).toBe("You're all set, there");
  });

  it.each([
    ['homeowner', false],
    ['provider', false],
    ['provider', true],
  ] as const)('for %s (verified %s) starts the checklist with a done account and exactly one next step', (role, verified) => {
    const card = finishCard({ role, verified, firstName: 'Juan' });

    expect(card.checklist[0]).toEqual({ label: 'Account created', state: 'done' });
    expect(card.checklist.filter((item) => item.state === 'next')).toHaveLength(1);
  });

  it('never offers a client the provider actions, nor a provider the client action', () => {
    const client = finishCard({ role: 'homeowner', verified: true, firstName: 'Juan' });
    const provider = finishCard({ role: 'provider', verified: false, firstName: 'Ana' });

    expect([client.primary.action, client.secondary?.action]).not.toContain('getVerified');
    expect([provider.primary.action, provider.secondary?.action]).not.toContain('postJob');
  });
});
