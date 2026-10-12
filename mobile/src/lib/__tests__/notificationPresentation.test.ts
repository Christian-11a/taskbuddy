import { groupNotificationsByDay, notificationIconName, notificationTone, type NotificationIconName } from '../notificationPresentation';
import type { NotificationTarget } from '../notificationRouting';

describe('notificationTone', () => {
  it.each([
    // Titles and bodies the backend writes today.
    ['Booking declined', 'Ana declined "Fix sink": no time', 'job_update', 'danger'],
    ['Application update', 'Your application to "Fix sink" was not selected.', 'application_update', 'danger'],
    ['Refund — job cancelled: Fix sink', 'The hold on your payment was released.', 'payment_update', 'danger'],
    ['Refund — hire did not complete: Fix sink', 'The hold on your payment was released.', 'payment_update', 'danger'],
    ['Booking confirmed', 'You were hired for "Fix sink".', 'application_update', 'success'],
    ['Wallet topped up', 'PHP 500.00 was added to your wallet.', 'wallet_update', 'success'],
    ['You received a review', 'Great work on the sink.', 'job_update', 'success'],
    ['New application', 'Ana applied to "Fix sink".', 'application_update', 'info'],
    ['Job update', 'Your job is open for proposals.', 'job_update', 'info'],
  ])('"%s" (%s) is %s', (title, body, type, tone) => {
    expect(notificationTone({ title, body, type })).toBe(tone);
  });

  it('never colours a chat message by what the message says', () => {
    expect(notificationTone({ title: 'New message', body: 'Are you cancelled on Friday?', type: 'message' })).toBe('info');
    expect(notificationTone({ title: 'New message', body: 'Confirmed, see you then', type: 'message' })).toBe('info');
  });

  it('tolerates a missing title or body', () => {
    expect(notificationTone({ title: null, body: null, type: 'announcement' })).toBe('info');
  });
});

describe('groupNotificationsByDay', () => {
  // 11 Oct 2026, 14:30 local time.
  const now = new Date(2026, 9, 11, 14, 30);
  const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).toISOString();

  it('puts everything since local midnight under today and keeps the order', () => {
    const rows = [
      { id: 'a', created_at: at(2026, 9, 11, 9, 0) },
      { id: 'b', created_at: at(2026, 9, 11, 0, 5) },
      { id: 'c', created_at: at(2026, 9, 10, 23, 59) },
    ];
    const groups = groupNotificationsByDay(rows, now);
    expect(groups.today.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups.earlier.map((r) => r.id)).toEqual(['c']);
  });

  it('keeps a timestamp a little ahead of this clock under today', () => {
    const groups = groupNotificationsByDay([{ id: 'a', created_at: at(2026, 9, 11, 14, 31) }], now);
    expect(groups.today.map((r) => r.id)).toEqual(['a']);
    expect(groups.earlier).toEqual([]);
  });

  it('sends a timestamp that cannot be read to earlier instead of crashing', () => {
    const groups = groupNotificationsByDay([{ id: 'x', created_at: 'not a date' }], now);
    expect(groups.earlier.map((r) => r.id)).toEqual(['x']);
  });

  it('returns two empty groups for an empty list', () => {
    expect(groupNotificationsByDay([], now)).toEqual({ today: [], earlier: [] });
  });
});

describe('notificationIconName', () => {
  type IconCase = {
    title: string;
    body: string;
    type: string;
    kind?: NotificationTarget['kind'];
    icon: NotificationIconName;
  };

  // Titles and bodies the backend writes, plus the ones seen on the device.
  const cases: IconCase[] = [
    // A new application shows an applicant, not a verified badge.
    { title: 'New application', body: 'Ana applied to "Fix sink".', type: 'application_update', icon: 'UserPlus' },
    { title: 'New application', body: 'Ana applied to "Cancel sink".', type: 'application_update', icon: 'UserPlus' },
    // A cancellation says so, whichever notification type carries it.
    { title: 'Cancellation agreed', body: 'Cancellation agreed. Any unsettled escrow was refunded to the client.', type: 'dispute_update', kind: 'dispute', icon: 'Ban' },
    { title: 'Cancellation response requested', body: 'Provider: agree or contest within 48 hours. No response refunds the client.', type: 'dispute_update', kind: 'dispute', icon: 'Ban' },
    { title: 'Cancellation under admin review', body: 'Any held payment is frozen until an admin records a decision.', type: 'dispute_update', kind: 'dispute', icon: 'Ban' },
    { title: 'Cancellation contested', body: 'Payment stays frozen for admin review. Both participants can add evidence.', type: 'dispute_update', kind: 'dispute', icon: 'Ban' },
    { title: 'Refund — job cancelled: Fix sink', body: 'The hold on your payment was released.', type: 'payment_update', icon: 'Ban' },
    // Hired, booked, done.
    { title: 'Application accepted', body: 'You were hired for "Fix sink".', type: 'application_update', icon: 'CircleCheckBig' },
    { title: 'Booking confirmed', body: 'You were hired for "Fix sink".', type: 'application_update', icon: 'CircleCheckBig' },
    { title: 'Hire confirmed', body: 'You paid ₱500.00 by card for "Fix sink". It is held in escrow until you confirm the job is done.', type: 'payment_update', icon: 'CircleCheckBig' },
    { title: 'Job completed', body: 'The client confirmed "Fix sink" is done.', type: 'job_update', icon: 'CircleCheckBig' },
    { title: 'You received a review', body: 'Great work on the sink.', type: 'job_update', icon: 'CircleCheckBig' },
    { title: 'Service request approved', body: 'Your approved services have been updated.', type: 'skill_request_update', icon: 'CircleCheckBig' },
    // Declined, rejected, not selected.
    { title: 'Application declined', body: 'Your application to "Fix sink" was declined.', type: 'application_update', icon: 'CircleX' },
    { title: 'Booking declined', body: 'Ana declined "Fix sink": no time', type: 'job_update', icon: 'CircleX' },
    { title: 'Application update', body: 'Your application to "Fix sink" was not selected.', type: 'application_update', icon: 'CircleX' },
    { title: 'Verification rejected', body: 'Your ID was rejected.', type: 'verification_update', icon: 'CircleX' },
    { title: 'Service request not approved', body: 'Your service request was not approved.', type: 'skill_request_update', icon: 'CircleX' },
    // Money.
    { title: 'Refund — hire did not complete: Fix sink', body: 'The hold on your payment was released.', type: 'payment_update', icon: 'Wallet' },
    { title: 'Wallet topped up', body: '₱500.00 has been added to your wallet.', type: 'payment_update', icon: 'Wallet' },
    { title: 'Withdrawal sent', body: 'Your withdrawal is on its way to your bank.', type: 'wallet_update', icon: 'Wallet' },
    { title: 'Payout sent to your Stripe account', body: 'Your payout for a card-paid job is on its way to your bank through Stripe.', type: 'wallet_update', icon: 'Wallet' },
    // Complaints and disputes.
    { title: 'Refund — dispute resolved: Fix sink', body: 'The hold on your payment was released.', type: 'payment_update', icon: 'ShieldAlert' },
    { title: 'Complaint opened', body: 'A complaint is awaiting admin review. Both participants can add statements and evidence.', type: 'dispute_update', kind: 'dispute', icon: 'ShieldAlert' },
    { title: 'Complaint resolved', body: 'An admin recorded a decision: refund. Thank you for your patience.', type: 'dispute_update', kind: 'dispute', icon: 'ShieldAlert' },
    { title: 'More information requested', body: 'The admin asked for more details.', type: 'dispute_update', kind: 'dispute', icon: 'ShieldAlert' },
    // Verification, chat, invites, announcements.
    { title: 'Verification approved', body: 'Your ID has been verified. Your profile now shows a verified badge.', type: 'verification_update', icon: 'BadgeCheck' },
    { title: 'Verification failed', body: 'Your ID could not be verified.', type: 'verification_update', icon: 'BadgeCheck' },
    { title: 'New message', body: 'Are you cancelled on Friday?', type: 'message', icon: 'MessageCircle' },
    { title: 'New message', body: 'Sent a photo', type: 'job_update', kind: 'chat', icon: 'MessageCircle' },
    { title: 'A job near you needs your skills', body: 'You were matched to the job "Fix sink". Check it out and apply!', type: 'recommendation_invite', icon: 'BriefcaseBusiness' },
    { title: 'Announcement', body: 'The app will be down for maintenance on Sunday.', type: 'announcement', icon: 'Megaphone' },
    // Requests and jobs in progress.
    { title: 'Service request submitted', body: 'Your service request is awaiting review.', type: 'skill_request_update', icon: 'ClipboardList' },
    { title: 'Work started', body: 'Ana started working on "Fix sink".', type: 'job_update', icon: 'ClipboardList' },
    { title: 'Job update', body: 'Your job is open for proposals.', type: 'job_update', icon: 'ClipboardList' },
    // Anything else.
    { title: 'Something new', body: 'Something the app does not know yet.', type: 'future_type', icon: 'BellRing' },
  ];

  it.each(cases)('"$title" ($type) shows $icon', ({ title, body, type, kind, icon }) => {
    expect(notificationIconName({ title, body, type, kind, tone: notificationTone({ title, body, type }) })).toBe(icon);
  });
});
