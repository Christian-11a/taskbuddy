import type { JobChangeRequest } from '../api';
import {
  canProposeScheduleChange, pendingScheduleChange, scheduleChangeActions, scheduleChangeErrors, scheduleChangeText,
} from '../scheduleChange';

const NOW = new Date('2026-10-18T00:00:00Z');
const req = (o: Partial<JobChangeRequest> = {}): JobChangeRequest => ({
  id: 'r1', job_id: 'j1', requested_by: 'c1', type: 'schedule', new_scheduled_at: '2026-10-21T06:00:00Z',
  new_budget: null, reason: 'Late shift', status: 'pending', created_at: '2026-10-17T00:00:00Z',
  expires_at: '2026-10-20T00:00:00Z', decided_at: null, ...o,
});

describe('scheduleChange', () => {
  it('finds the live pending schedule request only', () => {
    expect(pendingScheduleChange([req()], NOW)?.id).toBe('r1');
    expect(pendingScheduleChange([req({ status: 'accepted' })], NOW)).toBeNull();
    expect(pendingScheduleChange([req({ expires_at: '2026-10-17T00:00:00Z' })], NOW)).toBeNull();
    expect(pendingScheduleChange([req({ type: 'price' })], NOW)).toBeNull();
    expect(pendingScheduleChange(null, NOW)).toBeNull();
  });

  it('lets the sender withdraw and the other side decide', () => {
    expect(scheduleChangeActions(req(), 'c1')).toEqual({ canWithdraw: true, canDecide: false });
    expect(scheduleChangeActions(req(), 'p1')).toEqual({ canWithdraw: false, canDecide: true });
    expect(scheduleChangeActions(req({ status: 'declined' }), 'p1')).toEqual({ canWithdraw: false, canDecide: false });
  });

  it('allows a change only before work starts, with no complaint or pending request', () => {
    const ok = (status: string, pending: JobChangeRequest | null = null, display?: string) =>
      canProposeScheduleChange({ status, display_status: display } as never, 'c1', 'c1', 'p1', pending);
    expect(ok('confirmed')).toBe(true);
    expect(ok('assigned')).toBe(true);
    expect(ok('in_progress')).toBe(false);
    expect(ok('open')).toBe(false);
    expect(ok('confirmed', req())).toBe(false);
    expect(ok('confirmed', null, 'disputed')).toBe(false);
    expect(canProposeScheduleChange({ status: 'confirmed' } as never, 'x', 'c1', 'p1', null)).toBe(false);
  });

  it('words the request for each side', () => {
    expect(scheduleChangeText(req(), 'p1', 'Ana Cruz')).toMatch(/^Ana asked to move this job to .+\.$/);
    expect(scheduleChangeText(req(), 'c1', 'Ana Cruz')).toMatch(/^You asked to move/);
  });

  it('validates date, time, future and reason', () => {
    const future = new Date('2026-10-19T10:00:00Z');
    expect(scheduleChangeErrors(null, false, false, '', NOW)).toEqual({ date: expect.any(String), reason: expect.any(String) });
    expect(scheduleChangeErrors(null, true, false, 'x', NOW).time).toBeDefined();
    expect(scheduleChangeErrors(new Date('2026-10-17T10:00:00Z'), true, true, 'x', NOW).time).toMatch(/future/);
    expect(scheduleChangeErrors(future, true, true, 'x', NOW)).toEqual({});
    expect(scheduleChangeErrors(future, true, true, 'x'.repeat(301), NOW).reason).toBeDefined();
    expect(scheduleChangeErrors(future, true, true, '   ', NOW).reason).toBeDefined();
  });
});
