import { MaintenanceMiddleware } from './maintenance.middleware';
import type { SupabaseService } from '../supabase/supabase.service';

type QueryResult = { data: unknown; error: { message: string } | null };

function createSupabaseMock(result: QueryResult) {
  const eq = jest.fn().mockReturnThis();
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const select = jest.fn(() => ({ eq, maybeSingle }));
  eq.mockReturnValue({ maybeSingle });
  const from = jest.fn(() => ({ select }));
  return { admin: { from } } as unknown as SupabaseService;
}

function createResponse() {
  const res: { statusCode?: number; body?: unknown } = {};
  const json = jest.fn((body: unknown) => {
    res.body = body;
  });
  const status = jest.fn((code: number) => {
    res.statusCode = code;
    return { json };
  });
  return { status, json, result: res };
}

describe('MaintenanceMiddleware', () => {
  it('calls next() when maintenance mode is off', async () => {
    const supabase = createSupabaseMock({
      data: { maintenance_mode: false, maintenance_message: null },
      error: null,
    });
    const middleware = new MaintenanceMiddleware(supabase);
    const next = jest.fn();
    const { status } = createResponse();

    await middleware.use({} as never, { status } as never, next);

    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('responds 503 with the custom message when maintenance mode is on', async () => {
    const supabase = createSupabaseMock({
      data: { maintenance_mode: true, maintenance_message: 'Back at 9am' },
      error: null,
    });
    const middleware = new MaintenanceMiddleware(supabase);
    const next = jest.fn();
    const { status, result } = createResponse();

    await middleware.use({} as never, { status } as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual({ statusCode: 503, message: 'Back at 9am' });
  });

  it('falls open (calls next) when the read errors', async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: { message: 'boom' },
    });
    const middleware = new MaintenanceMiddleware(supabase);
    const next = jest.fn();
    const { status } = createResponse();

    await middleware.use({} as never, { status } as never, next);

    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
});
