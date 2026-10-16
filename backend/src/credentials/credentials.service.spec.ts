import { ConflictException, NotFoundException } from '@nestjs/common';
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
  return { supabase: { admin: { from } } as unknown as SupabaseService, calls };
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

const build = (results: Record<string, QueryResult[]>) => {
  const { supabase, calls } = createSupabaseMock(results);
  return {
    service: new CredentialsService(supabase, uploads, adminActions),
    calls,
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

  it('approves a pending credential, audits it and tells the provider', async () => {
    const { service, calls } = build({
      provider_credentials: [
        { data: row({ status: 'approved' }), error: null },
      ],
      notifications: [{ data: null, error: null }],
    });
    const result = await service.approve(admin, 'c1');
    expect(result.status).toBe('approved');
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['status', 'pending'] }),
    );
    expect(record).toHaveBeenCalledWith(
      admin,
      'credential.approve',
      'provider_credentials',
      'c1',
    );
  });

  it('refuses a second decision on the same credential', async () => {
    const { service } = build({
      provider_credentials: [{ data: null, error: null }],
    });
    await expect(
      service.reject(admin, 'c1', { reason: 'Unreadable photo' }),
    ).rejects.toBeInstanceOf(ConflictException);
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
