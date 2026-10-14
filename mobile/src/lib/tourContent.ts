/**
 * tourContent.ts: the words and checklists of the welcome flow, per role.
 *
 * Pure (no React, no storage) so every branch can be table-tested. The
 * `homeowner` role is the client in all visible text; providers see "the
 * client". Anchor ids name the controls the screens register with
 * `useTourAnchor`, so each step's spotlight lands on a real control.
 */
import type { TourStep } from '../components/tour/types';

export type WelcomeRole = 'homeowner' | 'provider';

export type IntroCard = { title: string; body: string };

export type FinishAction = 'postJob' | 'getVerified' | 'setupProfile' | 'close';
export type ChecklistState = 'done' | 'next' | 'later';
export type ChecklistItem = { label: string; state: ChecklistState };
export type FinishButton = { label: string; action: FinishAction };
export type FinishCard = {
  title: string;
  checklist: ChecklistItem[];
  primary: FinishButton;
  secondary?: FinishButton;
};

/** The first word of a name, or "there" when there is no name to use. */
export function firstNameFrom(name: string | null | undefined): string {
  const [first] = (name ?? '').trim().split(/\s+/);
  return first || 'there';
}

/** The three story cards that open the welcome flow. They set expectations; the spotlight tour teaches the controls. */
export function introCards(role: WelcomeRole, firstName: string | null | undefined): IntroCard[] {
  const name = firstNameFrom(firstName);
  if (role === 'provider') {
    return [
      {
        title: `Hi ${name}, let's get you hired`,
        body: 'Find jobs near you in the services you offer.',
      },
      {
        title: 'Send an offer, get booked',
        body: 'Clients compare offers. When one hires you, the booking is confirmed for you.',
      },
      {
        title: 'Get paid safely',
        body: "The client's payment is held and released to you after the job and a 3-day warranty.",
      },
    ];
  }
  return [
    {
      title: `Hi ${name}, help is close by`,
      body: 'Book trusted local pros for plumbing, cleaning, repairs and more.',
    },
    {
      title: 'You choose who comes',
      body: 'Pros send you offers. Compare ratings and reviews, then hire one.',
    },
    {
      title: 'Your money waits until the job is done',
      body: 'We hold your payment safely and release it after the work, with a 3-day warranty.',
    },
  ];
}

/**
 * The four spotlight steps on the first screen of each role. The provider's
 * availability toggle and feed search exist only once the provider is
 * verified. Until then the setup panel on Home is the anchor for an unverified
 * provider's first step, and the rest point at the tabs, which every provider
 * has. A step whose control is not on screen is passed over.
 */
export function tourSteps(role: WelcomeRole, verified = true): TourStep[] {
  if (role === 'provider') {
    if (!verified) {
      return [
        { anchorId: 'home.setup', title: 'Finish setting up', body: 'Add your details and ID so clients can find you.' },
        { anchorId: 'tab.work', title: 'Your work', body: 'Offers, bookings and jobs in progress, all in one place.' },
        // Withdrawals go to a GCash or bank account (the Withdraw sheet); no other payout rail is offered.
        { anchorId: 'tab.Wallet', title: 'Your earnings', body: 'Withdraw to your GCash or bank account once money is released.' },
        { anchorId: 'tab.Profile', title: 'Your profile', body: 'Keep your details, photo and services up to date.' },
      ];
    }
    return [
      { anchorId: 'home.availability', title: 'Be seen', body: 'Turn this on to get invited to jobs near you.' },
      { anchorId: 'home.feed', title: 'Open jobs near you', body: 'Open one and send a short, friendly offer.' },
      { anchorId: 'tab.work', title: 'Your work', body: 'Offers, bookings and jobs in progress, all in one place.' },
      // Withdrawals go to a GCash or bank account (the Withdraw sheet); no other payout rail is offered.
      { anchorId: 'tab.Wallet', title: 'Your earnings', body: 'Withdraw to your GCash or bank account once money is released.' },
    ];
  }
  return [
    { anchorId: 'home.post', title: 'Start here', body: 'Pick a service and describe the job. It takes about a minute.' },
    { anchorId: 'tab.jobs', title: 'Your jobs and offers', body: 'Offers, bookings and progress live here.' },
    { anchorId: 'home.wallet', title: 'Your wallet', body: 'Add money before you hire. It stays held until the job is done.' },
    { anchorId: 'home.bell', title: 'Never miss an offer', body: "We'll tell you when someone applies or your booking changes." },
  ];
}

/**
 * The finish card's title, checklist and buttons. A provider's checklist and
 * main action follow their real verification status and whether their profile
 * is ready to verify (address and bio); nothing here is a number.
 */
export function finishCard({ role, verified, firstName, hasServiceProfile = true }: {
  role: WelcomeRole;
  verified: boolean;
  firstName: string | null | undefined;
  /** The profile is ready to verify (address and bio). Until it is, verification waits, so the first step is the profile. */
  hasServiceProfile?: boolean;
}): FinishCard {
  const title = `You're all set, ${firstNameFrom(firstName)}`;
  const lookAround: FinishButton = { label: 'Look around first', action: 'close' };

  if (role === 'homeowner') {
    return {
      title,
      checklist: [
        { label: 'Account created', state: 'done' },
        { label: 'Post your first job', state: 'next' },
        { label: 'Hire a pro', state: 'later' },
      ],
      primary: { label: 'Post my first job', action: 'postJob' },
      secondary: lookAround,
    };
  }

  if (!verified && !hasServiceProfile) {
    return {
      title,
      checklist: [
        { label: 'Account created', state: 'done' },
        { label: 'Add your address and bio', state: 'next' },
        { label: 'Get verified', state: 'later' },
      ],
      primary: { label: 'Finish my profile', action: 'setupProfile' },
      secondary: lookAround,
    };
  }

  if (!verified) {
    return {
      title,
      checklist: [
        { label: 'Account created', state: 'done' },
        { label: 'Get verified', state: 'next' },
        { label: 'Send your first offer', state: 'later' },
      ],
      primary: { label: 'Get verified', action: 'getVerified' },
      secondary: lookAround,
    };
  }

  return {
    title,
    checklist: [
      { label: 'Account created', state: 'done' },
      { label: 'Get verified', state: 'done' },
      { label: 'Send your first offer', state: 'next' },
    ],
    primary: { label: 'Find my first job', action: 'close' },
  };
}
