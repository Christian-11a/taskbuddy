import { resolveNotificationTarget } from '../notificationRouting';

describe('resolveNotificationTarget', () => {
  it('homeowner + application_id routes to proposals', () => {
    expect(
      resolveNotificationTarget('homeowner', { job_id: 'job-1', application_id: 'app-1' }),
    ).toEqual({ kind: 'proposals', jobId: 'job-1' });
  });

  it('homeowner + only job_id routes to job', () => {
    expect(resolveNotificationTarget('homeowner', { job_id: 'job-1' })).toEqual({
      kind: 'job',
      jobId: 'job-1',
    });
  });

  it('provider + job_id routes to job, ignoring application_id', () => {
    expect(
      resolveNotificationTarget('provider', { job_id: 'job-1', application_id: 'app-1' }),
    ).toEqual({ kind: 'job', jobId: 'job-1' });
  });

  it('homeowner with neither job_id nor application_id resolves to none', () => {
    expect(resolveNotificationTarget('homeowner', {})).toEqual({ kind: 'none' });
  });

  it('provider with neither job_id nor application_id resolves to none', () => {
    expect(resolveNotificationTarget('provider', {})).toEqual({ kind: 'none' });
  });

  it('homeowner + application_id but no job_id resolves to none (matches existing screen logic)', () => {
    expect(resolveNotificationTarget('homeowner', { application_id: 'app-1' })).toEqual({
      kind: 'none',
    });
  });
});

it('routes text/photo message taps to chat ahead of job and application routes', () => {
  for (const role of ['homeowner', 'provider'] as const) {
    expect(resolveNotificationTarget(role, { job_id: 'j1', conversation_id: 'c1', application_id: 'a1' })).toEqual({ kind: 'chat', jobId: 'j1' });
  }
});
it('routes service acknowledgements and decisions to provider My Services', () => {
  expect(resolveNotificationTarget('provider', { request_id: 'r1' })).toEqual({ kind: 'services' });
  expect(resolveNotificationTarget('homeowner', { request_id: 'r1' })).toEqual({ kind: 'none' });
});
it('routes complaint notices to the case screen for either participant', () => {
  for (const role of ['homeowner', 'provider'] as const) {
    expect(resolveNotificationTarget(role, { job_id: 'j1', dispute_id: 'd1' })).toEqual({ kind: 'dispute', jobId: 'j1' });
  }
});

describe('resolveNotificationTarget with a server target', () => {
  const J = 'job-9';
  const cases: Array<[string, 'homeowner' | 'provider', object, unknown]> = [
    ['job / client', 'homeowner', { screen: 'job', job_id: J }, { kind: 'job', jobId: J }],
    ['job / provider', 'provider', { screen: 'job', job_id: J }, { kind: 'job', jobId: J }],
    ['dispute / client', 'homeowner', { screen: 'dispute', job_id: J }, { kind: 'dispute', jobId: J }],
    ['dispute / provider', 'provider', { screen: 'dispute', job_id: J }, { kind: 'job', jobId: J }],
    ['payouts / provider', 'provider', { screen: 'payouts' }, { kind: 'payouts' }],
    ['payouts / client with job', 'homeowner', { screen: 'payouts', job_id: J }, { kind: 'job', jobId: J }],
    ['payouts / client no job', 'homeowner', { screen: 'payouts' }, { kind: 'none' }],
    ['verification / provider', 'provider', { screen: 'verification' }, { kind: 'verification' }],
    ['verification / client', 'homeowner', { screen: 'verification' }, { kind: 'none' }],
    ['skill_requests / provider', 'provider', { screen: 'skill_requests', request_id: 'r1' }, { kind: 'services' }],
    ['skill_requests / client', 'homeowner', { screen: 'skill_requests' }, { kind: 'none' }],
    ['notifications / client', 'homeowner', { screen: 'notifications' }, { kind: 'none' }],
    ['notifications / provider', 'provider', { screen: 'notifications' }, { kind: 'none' }],
    ['unknown screen / client', 'homeowner', { screen: 'wallet_v2', job_id: J }, { kind: 'none' }],
    ['unknown screen / provider', 'provider', { screen: 'wallet_v2', job_id: J }, { kind: 'none' }],
  ];
  it.each(cases)('%s', (_name, role, target, expected) => {
    expect(resolveNotificationTarget(role, {}, target)).toEqual(expected);
  });

  it('reads target before data', () => {
    expect(resolveNotificationTarget('homeowner', { job_id: 'old', application_id: 'a' }, { screen: 'notifications' })).toEqual({ kind: 'none' });
  });

  it('accepts a JSON string target', () => {
    expect(resolveNotificationTarget('provider', {}, JSON.stringify({ screen: 'payouts' }))).toEqual({ kind: 'payouts' });
  });

  it('falls back to data rules when target is missing', () => {
    expect(resolveNotificationTarget('homeowner', { job_id: 'j', application_id: 'a' }, undefined)).toEqual({ kind: 'proposals', jobId: 'j' });
    expect(resolveNotificationTarget('provider', { request_id: 'r' }, null)).toEqual({ kind: 'services' });
  });

  it('homeowner + application_id with a job target routes to proposals', () => {
    expect(resolveNotificationTarget('homeowner', { job_id: 'j', application_id: 'a' }, { screen: 'job', job_id: 'j' })).toEqual({ kind: 'proposals', jobId: 'j' });
  });

  it('homeowner + application_id with no target routes to proposals', () => {
    expect(resolveNotificationTarget('homeowner', { job_id: 'j', application_id: 'a' })).toEqual({ kind: 'proposals', jobId: 'j' });
  });

  it('provider + application_id with a job target stays on job', () => {
    expect(resolveNotificationTarget('provider', { application_id: 'a' }, { screen: 'job', job_id: 'j' })).toEqual({ kind: 'job', jobId: 'j' });
  });

  it('keeps chat for Messages pushes even with a job target', () => {
    expect(resolveNotificationTarget('provider', { job_id: 'j', conversation_id: 'c' }, { screen: 'job', job_id: 'j' })).toEqual({ kind: 'chat', jobId: 'j' });
  });
});
