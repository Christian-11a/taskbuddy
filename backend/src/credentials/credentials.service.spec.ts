import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { AdminActionsService } from '../admin/admin-actions.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/** Chainable stand-in; results are consumed per `.from()` call. */
function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = resultsByTable[table]?.shift() ?? {
      data: null,
      error: { message: `no mock result for table '${table}'` },
    };
    const builder: Record<string, unknown> = {};
    for (const method of [
      'select',
      'update',
      'insert',
      'delete',
      'eq',
      'neq',
      'or',
      'order',
      'range',
    ]) {
      builder[method] = jest.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    }
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve);
    return builder;
  });
  const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    calls,
    rpc,
  };
}

const uploads = {
  assertOwnedPaths: jest.fn(),
  assertValidImage: jest.fn().mockResolvedValue(undefined),
  signedDownloadUrl: jest.fn(() => Promise.resolve('https://signed/doc')),
} as unknown as UploadsService;
const record = jest.fn().mockResolvedValue(undefined);
const adminActions = { record } as unknown as AdminActionsService;

const provider = { id: 'p1', role: 'provider' } as Profile;
const admin = { id: 'a1', role: 'admin' } as Profile;
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  provider_id: 'p1',
  title: 'Plumbing NC II',
  status: 'pending',
  expires_on: null,
  document_path: 'p1/cert.jpg',
  ...overrides,
});

/** Manila date, computed the same way the service does. */
const manilaDay = (offsetDays = 0) =>
  new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

const build = (results: Record<string, QueryResult[]>) => {
  const { supabase, calls, rpc } = createSupabaseMock(results);
  return {
    service: new CredentialsService(supabase, uploads, adminActions),
    calls,
    rpc,
  };
};

describe('CredentialsService', () => {
  it('stores a credential for the provider and hides the storage path', async () => {
    const { service, calls } = build({
      provider_credentials: [{ data: row(), error: null }],
    });
    const created = await service.create(provider, {
      category_id: 1,
      credential_type: 'tesda_nc',
      title: ' Plumbing NC II ',
      issuer: 'TESDA',
      document_path: 'p1/cert.jpg',
    });
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      provider_id: 'p1',
      title: 'Plumbing NC II',
    });
    expect(created).not.toHaveProperty('document_path');
    expect(created.document_url).toBe('https://signed/doc');
  });

  it('refuses a credential that has already expired', async () => {
    const { service } = build({});
    await expect(
      service.create(provider, {
        category_id: 1,
        credential_type: 'prc_license',
        title: 'Master Plumber',
        issuer: 'PRC',
        expires_on: '2000-01-01',
        document_path: 'p1/cert.jpg',
      }),
    ).rejects.toThrow('already expired');
  });

  it('shows clients approved, unexpired credentials only', async () => {
    const { service } = build({
      provider_credentials: [
        {
          data: [
            row({ id: 'ok', status: 'approved', expires_on: '2999-01-01' }),
            row({ id: 'old', status: 'approved', expires_on: '2001-01-01' }),
          ],
          error: null,
        },
      ],
    });
    const shown = await service.publicFor('p1');
    expect(shown.map((c) => c.id)).toEqual(['ok']);
  });

  const decided = (overrides: Record<string, unknown> = {}) => ({
    provider_id: 'p1',
    title: 'Plumbing NC II',
    category_id: 1,
    is_primary: true,
    identity_verified: true,
    verified: true,
    primary_certificate_valid: true,
    has_pending_primary_certificate: false,
    ...overrides,
  });
  const titles = (
    calls: { table: string; method: string; args: unknown[] }[],
  ) =>
    calls
      .filter((c) => c.table === 'notifications' && c.method === 'insert')
      .map((c) => (c.args[0] as { title: string }).title);

  it('approves through decide_credential (save + refresh in one transaction), audits and tells the provider', async () => {
    const { service, calls, rpc } = build({
      provider_credentials: [
        { data: row({ status: 'approved' }), error: null },
      ],
      notifications: [{ data: null, error: null }],
    });
    rpc.mockResolvedValue({ data: decided(), error: null });
    const result = await service.approve(admin, 'c1');
    expect(result.status).toBe('approved');
    expect(rpc).toHaveBeenCalledWith('decide_credential', {
      p_credential_id: 'c1',
      p_approve: true,
      p_reviewed_by: 'a1',
      p_reason: null,
    });
  });

  it('surfaces an expired approval as a bad request and writes nothing else', async () => {
    record.mockClear();
    const { service, rpc } = build({});
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'TB400',
        message:
          'This certificate expired on 2000-01-01. Ask the provider to upload a current one.',
      },
    });
    await expect(service.approve(admin, 'c1')).rejects.toThrow(
      new BadRequestException(
        'This certificate expired on 2000-01-01. Ask the provider to upload a current one.',
      ),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('a rejection always says "needs changes", even when the provider stays verified', async () => {
    const { service, calls, rpc } = build({
      provider_credentials: [
        { data: row({ status: 'rejected' }), error: null },
      ],
      notifications: [{ data: null, error: null }],
    });
    rpc.mockResolvedValue({ data: decided(), error: null });
    const result = await service.reject(admin, 'c1', { reason: 'Blurry scan' });
    expect(result.status).toBe('rejected');
    expect(rpc).toHaveBeenCalledWith('decide_credential', {
      p_credential_id: 'c1',
      p_approve: false,
      p_reviewed_by: 'a1',
      p_reason: 'Blurry scan',
    });
  });

  it('refuses a second decision on the same credential with a conflict', async () => {
    const { service, rpc } = build({});
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'TB409',
        message: 'This certificate was already approved',
      },
    });
    await expect(
      service.reject(admin, 'c1', { reason: 'Unreadable photo' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists the admin queue with the provider name flattened from provider_profiles', async () => {
    const { service, calls } = build({
      provider_credentials: [
        {
          data: [
            row({
              provider_profiles: { profiles: { full_name: 'Ana Cruz' } },
            }),
          ],
          error: null,
          count: 1,
        },
      ],
    });
    const result = await service.list({});
    const select = calls.find((c) => c.method === 'select')?.args[0] as string;
    expect(select).toContain(
      'provider_profiles!provider_credentials_provider_id_fkey(profiles(full_name))',
    );
    expect(select).not.toContain(
      ' profiles!provider_credentials_provider_id_fkey(full_name)',
    );
    expect(result.total).toBe(1);
    expect(result.credentials[0].profiles).toEqual({ full_name: 'Ana Cruz' });
    expect(result.credentials[0]).not.toHaveProperty('provider_profiles');
    expect(result.credentials[0]).not.toHaveProperty('document_path');
  });

  it('will not delete an approved credential', async () => {
    const { service, calls } = build({
      provider_credentials: [{ data: null, error: null }],
    });
    await expect(service.remove(provider, 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'neq', args: ['status', 'approved'] }),
    );
  });
});
