import { REPORT_REASONS, reasonLabel, reportChipText, reportConfirmMessage, reportOtherParty } from '../reportView';

describe('reportOtherParty', () => {
  it('is the assigned provider for the homeowner, or a plain word until the name is known', () => {
    expect(reportOtherParty({ assigned_provider: { full_name: 'TaskBuddyProvider' } }, false)).toBe('TaskBuddyProvider');
    expect(reportOtherParty({ assigned_provider: null }, false)).toBe('The provider');
    expect(reportOtherParty(null, false)).toBe('The provider');
  });

  it('is the client for the provider, whose own name is never the other party', () => {
    expect(reportOtherParty({ assigned_provider: { full_name: 'Ana Cruz' } }, true)).toBe('The client');
  });
});

describe('REPORT_REASONS', () => {
  it('sends exactly the reason values the backend gets today, in today\'s order', () => {
    expect(REPORT_REASONS).toEqual([
      'Payment or cancellation issue',
      'Work not completed',
      'Work quality issue',
      'Participant did not arrive',
      'Conduct issue',
      'Other',
    ]);
  });
});

describe('reasonLabel', () => {
  it('shows the friendlier words for the two reasons that read badly as labels', () => {
    expect(reasonLabel('Other', false)).toBe('Something else');
    expect(reasonLabel('Participant did not arrive', false)).toBe('Provider did not arrive');
    expect(reasonLabel('Participant did not arrive', true)).toBe('Client did not arrive');
  });

  it('keeps every other reason as its own label', () => {
    expect(reasonLabel('Work not completed', false)).toBe('Work not completed');
    expect(reasonLabel('Conduct issue', true)).toBe('Conduct issue');
  });
});

describe('reportChipText', () => {
  it('names the job and the provider for the homeowner', () => {
    expect(reportChipText({ title: 'Plumbing: Fix leaking faucet', assigned_provider: { full_name: 'TaskBuddyProvider' } }, false))
      .toBe('Plumbing: Fix leaking faucet · TaskBuddyProvider');
  });

  it('names only the job for the provider, whose own name is not the other party', () => {
    expect(reportChipText({ title: 'Plumbing: Fix leaking faucet', assigned_provider: { full_name: 'TaskBuddyProvider' } }, true))
      .toBe('Plumbing: Fix leaking faucet');
  });

  it('names only the job when no provider is assigned', () => {
    expect(reportChipText({ title: 'Plumbing: Fix leaking faucet', assigned_provider: null }, false)).toBe('Plumbing: Fix leaking faucet');
  });

  it('is null until the job has loaded', () => {
    expect(reportChipText(null, false)).toBeNull();
  });
});

describe('reportConfirmMessage', () => {
  it('lists the held payment, who is told, and that more can be added later', () => {
    expect(reportConfirmMessage({ held: 1, otherParty: 'TaskBuddyProvider' })).toBe([
      '• The ₱1.00 payment is paused until an admin decides.',
      '• TaskBuddyProvider is told and can add their side.',
      '• You can add more details or photos later.',
    ].join('\n'));
  });

  it('leaves out the payment line when no money is held', () => {
    expect(reportConfirmMessage({ held: null, otherParty: 'The client' })).toBe([
      '• The client is told and can add their side.',
      '• You can add more details or photos later.',
    ].join('\n'));
  });
});
