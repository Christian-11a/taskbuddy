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
