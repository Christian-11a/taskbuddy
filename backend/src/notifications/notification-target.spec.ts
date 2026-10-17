import { notificationTarget, withTarget } from './notification-target';

describe('notificationTarget', () => {
  it.each([
    ['application_update', { job_id: 'j1' }, { screen: 'job', job_id: 'j1' }],
    ['job_update', { job_id: 'j1' }, { screen: 'job', job_id: 'j1' }],
    [
      'recommendation_invite',
      { job_id: 'j1', run_id: 'r1' },
      { screen: 'job', job_id: 'j1' },
    ],
    ['dispute_update', { job_id: 'j1' }, { screen: 'dispute', job_id: 'j1' }],
    ['payment_update', { amount: 5 }, { screen: 'payouts' }],
    ['wallet_update', { job_id: 'j1' }, { screen: 'job', job_id: 'j1' }],
    ['verification_update', {}, { screen: 'verification' }],
    [
      'skill_request_update',
      { request_id: 's1' },
      { screen: 'skill_requests', request_id: 's1' },
    ],
    ['announcement', { broadcast_by: 'a1' }, { screen: 'notifications' }],
    ['job_update', null, { screen: 'notifications' }],
  ])('routes %s with %j', (type, data, target) => {
    expect(notificationTarget(type, data)).toEqual(target);
  });

  it('ignores a non-string job id', () => {
    expect(notificationTarget('job_update', { job_id: 42 })).toEqual({
      screen: 'notifications',
    });
  });

  it('keeps the row and adds the target', () => {
    expect(
      withTarget({ id: 'n1', type: 'job_update', data: { job_id: 'j1' } }),
    ).toEqual({
      id: 'n1',
      type: 'job_update',
      data: { job_id: 'j1' },
      target: { screen: 'job', job_id: 'j1' },
    });
  });
});
