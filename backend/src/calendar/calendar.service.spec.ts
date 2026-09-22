import { CalendarService } from './calendar.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

function serviceReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'gte', 'lte']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  const supabase = {
    admin: { from: jest.fn(() => builder) },
  } as unknown as SupabaseService;
  return new CalendarService(supabase);
}

describe('CalendarService.list', () => {
  it('leaves out bookings whose job was cancelled or expired', async () => {
    const service = serviceReturning([
      { id: 'b1', jobs: { status: 'confirmed' } },
      { id: 'b2', jobs: { status: 'cancelled' } },
      { id: 'b3', jobs: { status: 'expired' } },
      { id: 'b4', jobs: { status: 'in_progress' } },
    ]);

    const rows = await service.list(
      { id: 'p1', role: 'provider' } as Profile,
      {},
    );

    expect(rows.map((r: { id: string }) => r.id)).toEqual(['b1', 'b4']);
  });
});
