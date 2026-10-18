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

export type FinishAction = 'postJob' | 'getVerified' | 'setupProfile' | 'uploadCertificate' | 'linkPayout' | 'close';
export type ChecklistState = 'done' | 'next' | 'later';
/** `note` is a short line under the label, such as "Waiting for review". */
export type ChecklistItem = { label: string; state: ChecklistState; note?: string };
/** Where a provider's certificate stands: none yet, sent and waiting, approved, or unknown (the lookup failed; counts as not done). */
export type CertificateState = 'none' | 'pending' | 'approved' | 'unknown';
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

/** The three slides that open the welcome flow. They set expectations; the spotlight tour teaches the controls. */
export function introCards(role: WelcomeRole, firstName: string | null | undefined): IntroCard[] {
  const name = firstNameFrom(firstName);
  if (role === 'provider') {
    return [
      {
        title: `Hi ${name}, let's get you hired`,
        body: 'Find jobs near you in the services you offer.',
      },
      {
        title: 'Get verified, then send proposals',
        body: 'Add your ID, a certificate for your service, and a payout account. Then send a short proposal on any open job near you.',
      },
      {
        title: 'Get paid to GCash, Maya or your bank',
        body: 'When the client confirms the job is done, your pay is sent to your account, minus the platform fee.',
      },
    ];
  }
  return [
    {
      title: `Hi ${name}, help is close by`,
      body: 'Book trusted local providers for plumbing, cleaning, repairs and more.',
    },
    {
      title: 'Compare proposals, then hire',
      body: 'Providers send you proposals. Check their ratings, reviews and price, then hire the one you like.',
    },
    {
      title: 'Your payment waits until the job is done',
      body: 'We hold your payment and release it to the provider only when you confirm the job is done.',
    },
  ];
}

/** A provider's certificate state from their credentials list: approved beats pending; none, rejected or expired leave it "none". */
export function certificateStateFrom(credentials: { status: string }[] | null | undefined): CertificateState {
  const list = credentials ?? [];
  if (list.some((c) => c.status === 'approved')) return 'approved';
  if (list.some((c) => c.status === 'pending')) return 'pending';
  return 'none';
}

/** The buttons on the last onboarding slide. The app decides where the primary one goes. */
export function introButtons(role: WelcomeRole): { primary: string; secondary: string } {
  return {
    primary: role === 'provider' ? 'Finish setting up' : 'Post your first job',
    secondary: 'Look around first',
  };
}

/**
 * The spotlight steps on the first screen of each role. The provider's
 * availability toggle and feed exist only once the provider is verified; until
 * then the setup card is the first anchor. A step whose control is not on
 * screen is passed over, and the step counter counts only the steps shown.
 */
export function tourSteps(role: WelcomeRole, verified = true): TourStep[] {
  if (role === 'provider') {
    if (!verified) {
      return [
        { anchorId: 'home.setup', title: 'Finish setting up', body: 'Add your details, your ID, your certificate and a payout account so you can send proposals.' },
        { anchorId: 'tab.work', title: 'Your work', body: 'Proposals, bookings and jobs in progress, all in one place.' },
        { anchorId: 'tab.Messages', title: 'Chat with your clients', body: 'Filter by active or finished jobs.' },
        { anchorId: 'tab.Profile', title: 'Your earnings', body: 'See what was released to you and what was sent to your account, under Profile > Earnings.' },
      ];
    }
    return [
      { anchorId: 'home.availability', title: 'Be seen', body: 'Turn this on to get invited to jobs near you.' },
      { anchorId: 'home.feed', title: 'Open jobs near you', body: 'Open one to see the price, the platform fee and what you receive, then send a proposal.' },
      { anchorId: 'tab.work', title: 'Your work', body: 'Proposals, bookings and jobs in progress, all in one place.' },
      { anchorId: 'tab.Messages', title: 'Chat with your clients', body: 'Filter by active or finished jobs.' },
      { anchorId: 'tab.Profile', title: 'Your earnings', body: 'See what was released to you and what was sent to your account, under Profile > Earnings.' },
    ];
  }
  return [
    { anchorId: 'home.post', title: 'Start here', body: 'Pick a service and describe the job. It takes about a minute.' },
    { anchorId: 'tab.jobs', title: 'Your jobs and proposals', body: 'Proposals, bookings and progress for every job.' },
    { anchorId: 'tab.Messages', title: 'Chat with your provider', body: 'Message your provider about each job. Filter by active or finished jobs, or by service.' },
    { anchorId: 'home.bell', title: 'Never miss a proposal', body: 'We tell you when a provider sends a proposal or your booking changes.' },
    { anchorId: 'tab.Profile', title: 'Your payments', body: 'See what you paid and any refunds, month by month, under Profile > Payments.' },
  ];
}

/**
 * The finish card's title, checklist and buttons. A provider's checklist
 * follows their real setup: address, bio, verification, certificate and
 * payout account. The first step not done is "next" and is the main action.
 */
export function finishCard({
  role, verified, firstName, hasAddress = true, hasBio = true, certificate = 'approved', hasPayoutAccount = true,
}: {
  role: WelcomeRole;
  verified: boolean;
  firstName: string | null | undefined;
  hasAddress?: boolean;
  hasBio?: boolean;
  /** A pending or approved certificate counts as done ("Waiting for review" under a pending one). */
  certificate?: CertificateState;
  /** True when an account is linked, false when none is, null when unknown (the lookup failed): neither ticked nor next. */
  hasPayoutAccount?: boolean | null;
}): FinishCard {
  const title = `You're all set, ${firstNameFrom(firstName)}`;
  const lookAround: FinishButton = { label: 'Look around first', action: 'close' };

  if (role === 'homeowner') {
    return {
      title,
      checklist: [
        { label: 'Post a job', state: 'next' },
        { label: 'Compare proposals', state: 'later' },
        { label: 'Confirm when the job is done', state: 'later' },
      ],
      primary: { label: 'Post your first job', action: 'postJob' },
      secondary: lookAround,
    };
  }

  const certDone = certificate === 'approved' || certificate === 'pending';
  const steps: { label: string; done: boolean; unknown?: boolean; action: FinishAction; note?: string }[] = [
    { label: 'Add your address', done: hasAddress, action: 'setupProfile' },
    { label: 'Add a short bio', done: hasBio, action: 'setupProfile' },
    { label: 'Get verified', done: verified, action: 'getVerified' },
    { label: 'Upload your certificate', done: certDone, action: 'uploadCertificate', note: certificate === 'pending' ? 'Waiting for review' : undefined },
    { label: 'Link a payout account', done: hasPayoutAccount === true, unknown: hasPayoutAccount === null, action: 'linkPayout' },
  ];
  const nextIndex = steps.findIndex((step) => !step.done && !step.unknown);
  const checklist: ChecklistItem[] = steps.map((step, i) => ({
    label: step.label,
    state: step.done ? 'done' : i === nextIndex ? 'next' : 'later',
    ...(step.note ? { note: step.note } : {}),
  }));
  if (nextIndex === -1) {
    return { title, checklist, primary: { label: 'Find my first job', action: 'close' } };
  }
  return {
    title,
    checklist,
    primary: { label: 'Finish setting up', action: steps[nextIndex].action },
    secondary: lookAround,
  };
}
