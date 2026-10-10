import { groupNotificationsByDay, notificationTone } from '../notificationPresentation';

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
