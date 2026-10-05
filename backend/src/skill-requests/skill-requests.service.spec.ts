import { BadRequestException, ConflictException } from '@nestjs/common';
import { SkillRequestsService } from './skill-requests.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  count?: number;
  error: { message: string; code?: string } | null;
};

/** One queued result per `.from(table)` call, in order. */
function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = resultsByTable[table]?.shift() ?? {
      data: null,
      error: null,
    };
    const builder: Record<string, unknown> = {};
    for (const method of [
      'select',
      'insert',
      'update',
      'delete',
      'eq',
      'order',
      'limit',
      'range',
    ]) {
      builder[method] = jest.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    }
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (resolve: (v: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve);
    return builder;
  });
  const rpc = jest
    .fn()
    .mockResolvedValue(resultsByTable.rpc?.shift() ?? ok(null));
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    calls,
    rpc,
  };
}

const ok = (data: unknown): QueryResult => ({ data, error: null });
const provider = { id: 'p1', role: 'provider' } as Profile;
const admin = { id: 'a1', role: 'admin' } as Profile;

function createService(results: Record<string, QueryResult[]>) {
  const { supabase, calls, rpc } = createSupabaseMock(results);
  const service = new SkillRequestsService(supabase);
  return { service, calls, rpc };
}

const pendingRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  provider_id: 'p1',
  type: 'change_primary',
  category_id: 2,
  status: 'pending',
  category: { id: 2, name: 'Electrical' },
  ...overrides,
});

describe('SkillRequestsService.create', () => {
  const dto = {
    type: 'change_primary' as const,
    category_id: 2,
    reason: 'Licensed electrician since 2019.',
  };

  it('refuses a request for the service they already have', async () => {
    const { service } = createService({
      service_categories: [ok({ id: 2 })],
      provider_profiles: [ok({ category_id: 2 })],
    });
    await expect(service.create(provider, dto)).rejects.toThrow(
      'already your main service',
    );
  });

  it('refuses an inactive or unknown service', async () => {
    const { service } = createService({ service_categories: [ok(null)] });
    await expect(service.create(provider, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('answers 409 while another request is under review', async () => {
    const { service } = createService({
      service_categories: [ok({ id: 2 })],
      provider_profiles: [ok({ category_id: 1 })],
      skill_change_requests: [
        { data: null, error: { message: 'dup', code: '23505' } },
      ],
    });
    await expect(service.create(provider, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('SkillRequestsService decisions', () => {
  it('delegates approval, audit, services and notification to the atomic RPC', async () => {
    const { service, rpc, calls } = createService({
      rpc: [ok(pendingRow({ status: 'approved' }))],
    });
    await expect(
      service.approve(admin, 'r1', { note: 'Verified skills' }),
    ).resolves.toMatchObject({ status: 'approved' });
    expect(rpc).toHaveBeenCalledWith('review_service_request', {
      p_id: 'r1',
      p_admin: 'a1',
      p_status: 'approved',
      p_note: 'Verified skills',
    });
    expect(calls).toEqual([]);
  });
  it('surfaces persistence failures instead of reporting success', async () => {
    const { service } = createService({
      rpc: [
        { data: null, error: { message: 'Notification persistence failed' } },
      ],
    });
    await expect(service.reject(admin, 'r1')).rejects.toThrow(
      'Notification persistence failed',
    );
  });
  it('rejects competing decisions', async () => {
    const { service } = createService({
      rpc: [
        {
          data: null,
          error: { message: 'This request has already been decided' },
        },
      ],
    });
    await expect(service.approve(admin, 'r1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('SkillRequestsService.list', () => {
  it('uses a counted SQL page for provider/category search', async () => {
    const rows = [pendingRow()];
    const { service, rpc } = createService({
      rpc: [ok([{ rows, total: 42 }])],
    });
    await expect(
      service.list({
        status: 'pending',
        search: 'Rico',
        limit: 20,
        offset: 20,
      }),
    ).resolves.toEqual({ items: rows, total: 42 });
    expect(rpc).toHaveBeenCalledWith('admin_list_skill_requests', {
      p_search: 'Rico',
      p_status: 'pending',
      p_limit: 20,
      p_offset: 20,
    });
  });

  it('returns a counted page beyond the old 100-row cap', async () => {
    const rows = [pendingRow()];
    const { service, calls } = createService({
      skill_change_requests: [{ data: rows, error: null, count: 101 }],
    });
    await expect(
      service.list({ status: 'pending', limit: 20, offset: 100 }),
    ).resolves.toEqual({ items: rows, total: 101 });
    expect(calls).toContainEqual({
      table: 'skill_change_requests',
      method: 'range',
      args: [100, 119],
    });
    expect(calls).toContainEqual({
      table: 'skill_change_requests',
      method: 'eq',
      args: ['status', 'pending'],
    });
    expect(calls).toContainEqual({
      table: 'skill_change_requests',
      method: 'select',
      args: [expect.any(String), { count: 'exact' }],
    });
  });

  it('preserves the unpaginated response for deployed web builds', async () => {
    const rows = [pendingRow()];
    const { service } = createService({ skill_change_requests: [ok(rows)] });
    await expect(service.list({})).resolves.toEqual(rows);
  });

  it('keeps the total on an empty page', async () => {
    const { service } = createService({
      skill_change_requests: [{ data: [], error: null, count: 101 }],
    });
    await expect(service.list({ offset: 200 })).resolves.toEqual({
      items: [],
      total: 101,
    });
  });
});
