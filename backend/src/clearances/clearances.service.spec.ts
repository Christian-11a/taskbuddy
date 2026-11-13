import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ClearancesService } from './clearances.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { Profile } from '../common/types';

type Result = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number;
};

function build(tables: Record<string, Result[]> = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = tables[table]?.shift() ?? {
      data: null,
      error: { message: `no mock for ${table}` },
    };
    const b: Record<string, unknown> = {};
    for (const m of [
      'select',
      'insert',
      'delete',
      'eq',
      'in',
      'order',
      'range',
    ]) {
      b[m] = jest.fn((...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return b;
      });
    }
    b.single = jest.fn(() => Promise.resolve(result));
    b.maybeSingle = jest.fn(() => Promise.resolve(result));
    b.then = (resolve: (v: Result) => unknown) =>
      Promise.resolve(result).then(resolve);
    return b;
  });
  const rpc = jest.fn().mockResolvedValue({ data: {}, error: null });
  const uploads = {
    assertOwnedPaths: jest.fn(),
    assertValidImage: jest.fn().mockResolvedValue(undefined),
    signedDownloadUrl: jest.fn(() => Promise.resolve('https://signed/doc')),
  } as unknown as UploadsService;
  const service = new ClearancesService(
    { admin: { from, rpc } } as unknown as SupabaseService,
    uploads,
  );
  return { service, calls, rpc, uploads };
}

const provider = { id: 'p1', role: 'provider' } as Profile;
const admin = { id: 'a1', role: 'admin' } as Profile;
const day = (offset: number) =>
  new Date(Date.now() + 8 * 3600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
const row = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  provider_id: 'p1',
  clearance_type: 'nbi',
  clearance_number: 'A123',
  status: 'pending',
  expires_on: day(300),
  document_path: 'p1/nbi.jpg',
  ...over,
});
const dto = {
  clearance_type: 'nbi' as const,
  clearance_number: ' A12345 ',
  expires_on: day(300),
  document_path: 'p1/nbi.jpg',
};

describe('ClearancesService', () => {
  it('stores a clearance for the provider, checks the photo, and hides the storage path', async () => {
    const { service, calls, uploads } = build({
      provider_clearances: [{ data: row(), error: null }],
    });
    const created = await service.create(provider, dto);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, not a real method
    expect(uploads.assertOwnedPaths).toHaveBeenCalledWith(provider, [
      'p1/nbi.jpg',
    ]);
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      provider_id: 'p1',
      clearance_number: 'A12345',
    });
    expect(created).not.toHaveProperty('document_path');
    expect(created.document_url).toBe('https://signed/doc');
  });

  it('refuses an expired clearance and an issue date after the expiry', async () => {
    const { service } = build();
    await expect(
      service.create(provider, { ...dto, expires_on: day(-1) }),
    ).rejects.toThrow('already expired');
    await expect(
      service.create(provider, { ...dto, issued_on: day(400) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('says so when one is already under review', async () => {
    const { service } = build({
      provider_clearances: [
        { data: null, error: { message: 'dup', code: '23505' } },
      ],
    });
    await expect(service.create(provider, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('shows an approved clearance past its expiry as expired', async () => {
    const { service } = build({
      provider_clearances: [
        {
          data: [row({ status: 'approved', expires_on: day(-2) })],
          error: null,
        },
      ],
    });
    const [only] = await service.mine(provider);
    expect(only.status).toBe('expired');
  });

  it('approves, rejects and revokes through the SQL functions', async () => {
    const { service, rpc } = build({
      provider_clearances: [
        { data: row({ status: 'approved' }), error: null },
        { data: row({ status: 'rejected' }), error: null },
        { data: row({ status: 'revoked' }), error: null },
      ],
    });
    await service.approve(admin, 'k1');
    expect(rpc).toHaveBeenLastCalledWith('decide_clearance', {
      p_clearance_id: 'k1',
      p_approve: true,
      p_reviewed_by: 'a1',
      p_reason: null,
    });
    await service.reject(admin, 'k1', { reason: ' Blurry ' });
    expect(rpc).toHaveBeenLastCalledWith('decide_clearance', {
      p_clearance_id: 'k1',
      p_approve: false,
      p_reviewed_by: 'a1',
      p_reason: 'Blurry',
    });
    rpc.mockResolvedValueOnce({
      data: { verified: false, withdrawn_proposals: 1 },
      error: null,
    });
    const revoked = await service.revoke(admin, 'k1', {
      reason: ' Number not in NBI records ',
    });
    expect(rpc).toHaveBeenLastCalledWith('admin_revoke_verification', {
      p_kind: 'clearance',
      p_id: 'k1',
      p_admin_id: 'a1',
      p_reason: 'Number not in NBI records',
    });
    expect(revoked.revoke).toEqual({ verified: false, withdrawn_proposals: 1 });
  });

  it('maps SQL errors to HTTP errors', async () => {
    const { service, rpc } = build();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'TB409', message: 'already approved' },
    });
    await expect(service.approve(admin, 'k1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'TB404', message: 'Clearance not found' },
    });
    await expect(service.approve(admin, 'k1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'TB400', message: 'expired' },
    });
    await expect(service.approve(admin, 'k1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns the duplicate signals for a provider', async () => {
    const { service, rpc } = build();
    const signals = [
      {
        kind: 'phone',
        other_id: 'p2',
        other_name: 'Ana',
        other_status: 'suspended',
      },
    ];
    rpc.mockResolvedValueOnce({ data: signals, error: null });
    await expect(service.duplicates('p1')).resolves.toEqual(signals);
    expect(rpc).toHaveBeenCalledWith('provider_duplicate_signals', {
      p_provider_id: 'p1',
    });
  });

  it('reports whether a clearance is required, and false when the setting cannot be read', async () => {
    const on = build({
      verification_settings: [
        { data: { require_clearance: true }, error: null },
      ],
    });
    await expect(on.service.required()).resolves.toBe(true);
    const broken = build({
      verification_settings: [{ data: null, error: { message: 'missing' } }],
    });
    await expect(broken.service.required()).resolves.toBe(false);
  });

  it('lets a provider remove only a pending or rejected clearance', async () => {
    const { service, calls } = build({
      provider_clearances: [{ data: null, error: null }],
    });
    await expect(service.remove(provider, 'k1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'in',
        args: ['status', ['pending', 'rejected']],
      }),
    );
  });
});
