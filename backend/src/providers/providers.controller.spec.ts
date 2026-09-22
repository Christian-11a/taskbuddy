import { ProvidersController } from './providers.controller';
import type { SupabaseService } from '../supabase/supabase.service';

function createSupabaseMock(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    builder[method] = jest.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return method === 'limit'
        ? Promise.resolve({ data: rows, error: null })
        : builder;
    });
  }
  const supabase = {
    admin: { from: jest.fn(() => builder) },
  } as unknown as SupabaseService;
  return { supabase, calls };
}

describe('ProvidersController.recentWork', () => {
  it('returns only completed jobs assigned to the provider', async () => {
    const rows = [{ id: 'j1', title: 'Fix sink' }];
    const { supabase, calls } = createSupabaseMock(rows);
    const controller = new ProvidersController(supabase);

    await expect(controller.recentWork('p-1')).resolves.toEqual(rows);
    expect(calls).toContainEqual({
      method: 'eq',
      args: ['assigned_provider_id', 'p-1'],
    });
    expect(calls).toContainEqual({
      method: 'eq',
      args: ['status', 'completed'],
    });
  });

  it('never selects client or location fields', async () => {
    const { supabase, calls } = createSupabaseMock([]);
    await new ProvidersController(supabase).recentWork('p-1');

    const columns = String(calls.find((c) => c.method === 'select')?.args[0]);
    expect(columns).not.toMatch(/client|address|latitude|photo/);
  });
});
