import {
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VerificationsService, namesMatch } from './verifications.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { StripeService } from '../payments/stripe.service';
import type { AdminActionsService } from '../admin/admin-actions.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/** Same chainable stand-in as admin.service.spec.ts — results consumed per `.from()`. */
function createSupabaseMock(
  resultsByTable: Record<string, QueryResult[]>,
  rpcResults: Record<string, unknown> = {},
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = resultsByTable[table]?.shift() ?? {
      data: null,
      error: { message: `no mock result for table '${table}'` },
    };
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    for (const method of [
      'select',
      'update',
      'insert',
      'eq',
      'in',
      'order',
      'range',
      'limit',
    ]) {
      builder[method] = chain(method);
    }
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  const rpc = jest.fn((name: string, args: unknown) => {
    calls.push({ table: `rpc:${name}`, method: 'rpc', args: [args] });
    const out = rpcResults[name] as { __error?: unknown } | undefined;
    if (out && typeof out === 'object' && '__error' in out)
      return Promise.resolve({ data: null, error: out.__error });
    return Promise.resolve({ data: out ?? false, error: null });
  });
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    calls,
  };
}

function createUploadsMock(): UploadsService {
  return {
    assertOwnedPaths: jest.fn(),
    assertValidImage: jest.fn().mockResolvedValue(undefined),
    signedDownloadUrl: jest.fn(() => Promise.resolve('https://signed/doc')),
    publicUrl: jest.fn(() => 'https://public/photo'),
  } as unknown as UploadsService;
}

/**
 * The manual-review paths under test never reach Stripe. Methods are stubbed
 * to throw so a test that unexpectedly takes the Identity route fails loudly
 * instead of quietly passing against an undefined.
 */
function createStripeMock(): StripeService {
  return {
    get stripe(): never {
      throw new Error('Stripe should not be reached on the manual path');
    },
    publishableKey: 'pk_test_stub',
  } as unknown as StripeService;
}

/** A Stripe stand-in for the Identity route: every call is a jest.fn. */
function createIdentityStripeMock() {
  const sessionsCreate = jest
    .fn()
    .mockResolvedValue({ id: 'vs_1', url: 'https://verify.stripe.com/s/vs_1' });
  const sessionsCancel = jest.fn().mockResolvedValue({ id: 'vs_1' });
  const keysCreate = jest.fn().mockResolvedValue({ secret: 'ek_secret' });
  const sessionsRetrieve = jest.fn().mockResolvedValue({
    id: 'vs_1',
    verified_outputs: { first_name: 'Maria', last_name: 'Santos' },
  });
  const service = {
    stripe: {
      identity: {
        verificationSessions: {
          create: sessionsCreate,
          cancel: sessionsCancel,
          retrieve: sessionsRetrieve,
        },
      },
      ephemeralKeys: { create: keysCreate },
    },
    publishableKey: 'pk_test_stub',
  } as unknown as StripeService;
  return {
    service,
    sessionsCreate,
    sessionsCancel,
    sessionsRetrieve,
    keysCreate,
  };
}

/** Shaped like a stripe-node error: a `type` and Stripe's own statusCode. */
function stripeError(message: string) {
  return Object.assign(new Error(message), {
    type: 'StripeInvalidRequestError',
    statusCode: 400,
  });
}

function createAdminActionsMock() {
  const record = jest.fn().mockResolvedValue(undefined);
  return { mock: { record } as unknown as AdminActionsService, record };
}

const provider = { id: 'p1', role: 'provider' } as Profile;
const admin = { id: 'a1', role: 'admin' } as Profile;

/** provider_profiles lookup result for a provider who has set up their service. */
const HAS_PROFILE = { data: { profile_id: 'p1' }, error: null };
/** provider_profiles lookup result for a provider who never picked a service. */
const NO_PROFILE = { data: null, error: null };

describe('VerificationsService', () => {
  describe('submit', () => {
    it('rejects a second submission while one is still pending', async () => {
      const { supabase } = createSupabaseMock({
        provider_profiles: [HAS_PROFILE],
        provider_verifications: [
          { data: null, error: { message: 'duplicate', code: '23505' } },
        ],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await expect(
        service.submit(provider, {
          id_document_path: 'p1/id.jpg',
          selfie_path: 'p1/selfie.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('runs the pre-check on both uploads before inserting', async () => {
      const uploads = createUploadsMock();
      const pending = { id: 'v1', provider_id: 'p1', status: 'pending' };
      const { supabase } = createSupabaseMock({
        provider_profiles: [HAS_PROFILE],
        provider_verifications: [{ data: pending, error: null }],
      });
      const service = new VerificationsService(
        supabase,
        uploads,
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await service.submit(provider, {
        id_document_path: 'p1/id.jpg',
        selfie_path: 'p1/selfie.jpg',
      });

      expect((uploads.assertValidImage as jest.Mock).mock.calls).toEqual([
        ['verification-docs', 'p1/id.jpg'],
        ['verification-docs', 'p1/selfie.jpg'],
      ]);
    });

    it('rejects a submission that fails the upload pre-check', async () => {
      const uploads = createUploadsMock();
      (uploads.assertValidImage as jest.Mock).mockRejectedValue(
        new BadRequestException('Uploaded file is empty: p1/id.jpg'),
      );
      const { supabase } = createSupabaseMock({});
      const service = new VerificationsService(
        supabase,
        uploads,
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await expect(
        service.submit(provider, {
          id_document_path: 'p1/id.jpg',
          selfie_path: 'p1/selfie.jpg',
        }),
      ).rejects.toThrow('Uploaded file is empty');
      // Never reaches the insert once the pre-check fails.
      expect(
        (supabase.admin.from as jest.Mock).mock.calls.some(
          (c: unknown[]) => c[0] === 'provider_verifications',
        ),
      ).toBe(false);
    });

    it('409s with a "finish your profile" message when no provider_profiles row exists', async () => {
      const { supabase, calls } = createSupabaseMock({
        provider_profiles: [NO_PROFILE],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await expect(
        service.submit(provider, {
          id_document_path: 'p1/id.jpg',
          selfie_path: 'p1/selfie.jpg',
        }),
      ).rejects.toThrow(/Edit Profile/);
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('refuses paths belonging to another user', async () => {
      const uploads = createUploadsMock();
      (uploads.assertOwnedPaths as jest.Mock).mockImplementation(() => {
        throw new BadRequestException('Upload path does not belong');
      });
      const { supabase } = createSupabaseMock({});
      const service = new VerificationsService(
        supabase,
        uploads,
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await expect(
        service.submit(provider, {
          id_document_path: 'someone-else/id.jpg',
          selfie_path: 'p1/selfie.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  const decision = (overrides: Record<string, unknown> = {}) => ({
    provider_id: 'p1',
    status: 'approved',
    identity_verified: true,
    verified: true,
    primary_certificate_valid: true,
    has_pending_certificate: false,
    ...overrides,
  });
  const makeService = (
    tables: Record<string, QueryResult[]>,
    rpcResults: Record<string, unknown>,
  ) => {
    const { supabase, calls } = createSupabaseMock(tables, rpcResults);
    const { mock: adminActions, record } = createAdminActionsMock();
    const service = new VerificationsService(
      supabase,
      createUploadsMock(),
      createStripeMock(),
      adminActions,
    );
    return { service, calls, record };
  };
  const decideCall = (
    calls: { table: string; method: string; args: unknown[] }[],
  ) => calls.find((c) => c.table === 'rpc:decide_identity_verification');

  describe('approve', () => {
    it('decides in one SQL call, audits and notifies', async () => {
      const { service, calls } = makeService(
        {
          provider_verifications: [
            { data: { id: 'v1', status: 'approved' }, error: null },
          ],
          notifications: [{ data: null, error: null }],
        },
        { decide_identity_verification: decision() },
      );

      const result = await service.approve(admin, 'v1');

      expect(result).toMatchObject({ status: 'approved' });
      expect(decideCall(calls)?.args[0]).toEqual({
        p_verification_id: 'v1',
        p_approve: true,
        p_reviewed_by: 'a1',
        p_reason: null,
      });
      // No separate profile or status writes: the SQL function owns them.
      expect(calls.some((c) => c.method === 'update')).toBe(false);
    });

    it('409s on a verification that was already decided, without notifying', async () => {
      const { service, record } = makeService(
        {},
        {
          decide_identity_verification: {
            __error: {
              code: 'TB409',
              message: 'This verification was already approved',
            },
          },
        },
      );

      await expect(service.approve(admin, 'v1')).rejects.toThrow(
        ConflictException,
      );
      expect(record).not.toHaveBeenCalled();
    });

    it('404s when the verification does not exist', async () => {
      const { service } = makeService(
        {},
        {
          decide_identity_verification: {
            __error: { code: 'TB404', message: 'Verification not found' },
          },
        },
      );

      await expect(service.approve(admin, 'v1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409s, leaving the review pending, when the provider has no provider_profiles row', async () => {
      const { service, calls, record } = makeService(
        {},
        {
          decide_identity_verification: {
            __error: {
              code: 'TB409',
              message: 'This provider has not set up their service profile yet',
            },
          },
        },
      );

      await expect(service.approve(admin, 'v1')).rejects.toThrow(
        ConflictException,
      );
      expect(calls.some((c) => c.table === 'notifications')).toBe(false);
      expect(record).not.toHaveBeenCalled();
    });

    it('surfaces a failed decision instead of reporting success', async () => {
      const { service } = makeService(
        {},
        { decide_identity_verification: { __error: { message: 'boom' } } },
      );

      await expect(service.approve(admin, 'v1')).rejects.toThrow('boom');
    });
  });

  describe('applyIdentityResult', () => {
    const pendingIdentity = {
      id: 'v1',
      provider_id: 'p1',
      status: 'pending',
      method: 'stripe_identity',
    };

    it('leaves the review pending for an admin when the provider has no provider_profiles row', async () => {
      const { supabase, calls } = createSupabaseMock({
        provider_verifications: [{ data: pendingIdentity, error: null }],
        provider_profiles: [NO_PROFILE],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      // Resolves (a 2xx to Stripe, so it stops retrying) without writing anything.
      await expect(
        service.applyIdentityResult('vs_1', 'verified'),
      ).resolves.toBeUndefined();
      expect(calls.some((c) => c.method === 'update')).toBe(false);
      expect(calls.some((c) => c.table === 'notifications')).toBe(false);
    });

    it('approves through the SQL decision when the row exists', async () => {
      const { supabase, calls } = createSupabaseMock(
        {
          provider_verifications: [{ data: pendingIdentity, error: null }],
          provider_profiles: [HAS_PROFILE],
          profiles: [
            { data: { full_name: 'Maria Clara Santos' }, error: null },
          ],
          notifications: [{ data: null, error: null }],
        },
        { decide_identity_verification: decision() },
      );
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createIdentityStripeMock().service,
        createAdminActionsMock().mock,
      );

      await service.applyIdentityResult('vs_1', 'verified');

      expect(decideCall(calls)?.args[0]).toEqual({
        p_verification_id: 'v1',
        p_approve: true,
        p_reviewed_by: null,
        p_reason: null,
      });
      expect(calls.some((c) => c.method === 'update')).toBe(false);
    });

    it('ignores the outcome, without a retry, when an admin decided the submission first', async () => {
      const { supabase } = createSupabaseMock(
        {
          provider_verifications: [{ data: pendingIdentity, error: null }],
          notifications: [{ data: null, error: null }],
        },
        {
          decide_identity_verification: {
            __error: {
              code: 'TB409',
              message: 'This verification was already rejected',
            },
          },
        },
      );
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );
      jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});

      await expect(
        service.applyIdentityResult('vs_1', 'rejected', 'Expired ID'),
      ).resolves.toBeUndefined();
    });

    it('leaves a verified document pending when it names someone else', async () => {
      const { supabase, calls } = createSupabaseMock({
        provider_verifications: [{ data: pendingIdentity, error: null }],
        provider_profiles: [HAS_PROFILE],
        profiles: [{ data: { full_name: 'Juan Dela Cruz' }, error: null }],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createIdentityStripeMock().service,
        createAdminActionsMock().mock,
      );

      await service.applyIdentityResult('vs_1', 'verified');

      expect(calls.some((c) => c.method === 'update')).toBe(false);
    });

    it('records a rejection through the SQL decision and tells the provider', async () => {
      const { supabase, calls } = createSupabaseMock(
        {
          provider_verifications: [{ data: pendingIdentity, error: null }],
          notifications: [{ data: null, error: null }],
        },
        {
          decide_identity_verification: decision({
            status: 'rejected',
            identity_verified: false,
            verified: false,
          }),
        },
      );
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await service.applyIdentityResult('vs_1', 'rejected', 'Expired ID');

      expect(decideCall(calls)?.args[0]).toEqual({
        p_verification_id: 'v1',
        p_approve: false,
        p_reviewed_by: null,
        p_reason: 'Expired ID',
      });
    });
  });

  describe('reject', () => {
    it('stores the reason via the SQL decision and always sends "needs changes"', async () => {
      const { service, calls } = makeService(
        {
          provider_verifications: [
            { data: { id: 'v1', status: 'rejected' }, error: null },
          ],
          notifications: [{ data: null, error: null }],
        },
        {
          // Still verified through a certificate: the message is sent anyway.
          decide_identity_verification: decision({
            status: 'rejected',
            verified: true,
          }),
        },
      );

      await service.reject(admin, 'v1', { reason: 'Blurry photo' });

      expect(decideCall(calls)?.args[0]).toEqual({
        p_verification_id: 'v1',
        p_approve: false,
        p_reviewed_by: 'a1',
        p_reason: 'Blurry photo',
      });
    });
  });

  describe('verificationState services', () => {
    it('returns the approved identity and primary certificate through mine', async () => {
      const { supabase } = createSupabaseMock({
        provider_verifications: [
          { data: { id: 'v1', status: 'approved' }, error: null },
        ],
        provider_profiles: [
          {
            data: {
              category_id: 1,
              is_verified: true,
              identity_verified: true,
              service_categories: { name: 'Plumbing' },
            },
            error: null,
          },
        ],
        provider_credentials: [
          {
            data: [{ category_id: 1, status: 'approved', expires_on: null }],
            error: null,
          },
        ],
        provider_secondary_categories: [{ data: [], error: null }],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await expect(service.mine(provider)).resolves.toMatchObject({
        identity: 'approved',
        certificate: 'approved',
        verified: true,
        services: [
          {
            category_id: 1,
            name: 'Plumbing',
            primary: true,
            certificate: 'approved',
          },
        ],
      });
    });

    it('lists the primary and secondary services with their own certificate state', async () => {
      const future = '2999-01-01';
      const { supabase } = createSupabaseMock({
        provider_profiles: [
          {
            data: {
              category_id: 1,
              is_verified: true,
              identity_verified: true,
              service_categories: { name: 'Plumbing' },
            },
            error: null,
          },
        ],
        provider_credentials: [
          {
            data: [
              { category_id: 1, status: 'approved', expires_on: future },
              { category_id: 3, status: 'approved', expires_on: '2001-01-01' },
              { category_id: 4, status: 'pending', expires_on: null },
            ],
            error: null,
          },
        ],
        provider_secondary_categories: [
          {
            data: [
              { category_id: 2, service_categories: { name: 'Electrical' } },
              { category_id: 3, service_categories: { name: 'Cleaning' } },
              { category_id: 4, service_categories: { name: 'Painting' } },
            ],
            error: null,
          },
        ],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      const state = await service.verificationState('p1');

      expect(state).toMatchObject({
        identity: 'approved',
        certificate: 'approved',
        verified: true,
      });
      expect(state.services).toEqual([
        {
          category_id: 1,
          name: 'Plumbing',
          primary: true,
          certificate: 'approved',
        },
        {
          category_id: 2,
          name: 'Electrical',
          primary: false,
          certificate: 'none',
        },
        {
          category_id: 3,
          name: 'Cleaning',
          primary: false,
          certificate: 'expired',
        },
        {
          category_id: 4,
          name: 'Painting',
          primary: false,
          certificate: 'pending',
        },
      ]);
    });

    it('uses the primary category relationship and always lists it for a profile', async () => {
      const { supabase, calls } = createSupabaseMock({
        provider_profiles: [
          {
            data: {
              category_id: 1,
              is_verified: false,
              identity_verified: false,
              service_categories: { name: 'Plumbing' },
            },
            error: null,
          },
        ],
        provider_credentials: [{ data: [], error: null }],
        provider_secondary_categories: [{ data: [], error: null }],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      const state = await service.verificationState('p1');

      expect(
        calls.find(
          (call) =>
            call.table === 'provider_profiles' && call.method === 'select',
        )?.args[0],
      ).toContain('service_categories!category_id(name)');
      expect(state.services).toEqual([
        {
          category_id: 1,
          name: 'Plumbing',
          primary: true,
          certificate: 'none',
        },
      ]);
    });

    it('rejects a profile lookup failure instead of reporting unverified', async () => {
      const { supabase } = createSupabaseMock({
        provider_profiles: [
          { data: null, error: { message: 'PGRST201', code: 'PGRST201' } },
        ],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );
      const logError = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => {});

      await expect(service.verificationState('p1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(logError).toHaveBeenCalledWith(
        'Provider profile lookup failed for p1: PGRST201',
      );
    });

    it.each(['provider_credentials', 'provider_secondary_categories'])(
      'rejects a %s lookup failure instead of returning incomplete status',
      async (failedTable) => {
        const { supabase } = createSupabaseMock({
          provider_profiles: [
            {
              data: {
                category_id: 1,
                is_verified: true,
                identity_verified: true,
                service_categories: { name: 'Plumbing' },
              },
              error: null,
            },
          ],
          provider_credentials: [
            {
              data: null,
              error:
                failedTable === 'provider_credentials'
                  ? { message: 'Credentials unavailable' }
                  : null,
            },
          ],
          provider_secondary_categories: [
            {
              data: null,
              error:
                failedTable === 'provider_secondary_categories'
                  ? { message: 'Services unavailable' }
                  : null,
            },
          ],
        });
        const service = new VerificationsService(
          supabase,
          createUploadsMock(),
          createStripeMock(),
          createAdminActionsMock().mock,
        );
        jest.spyOn(service['logger'], 'error').mockImplementation(() => {});

        await expect(service.verificationState('p1')).rejects.toThrow(
          InternalServerErrorException,
        );
      },
    );

    it('keeps an empty state for a provider without a profile row', async () => {
      const { supabase } = createSupabaseMock({
        provider_profiles: [{ data: null, error: null }],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await expect(service.verificationState('p1')).resolves.toEqual({
        identity: 'none',
        certificate: 'none',
        verified: false,
        services: [],
      });
    });
  });

  describe('list', () => {
    it('denormalises name, email, and signed document URLs', async () => {
      const { supabase } = createSupabaseMock({
        provider_verifications: [
          {
            data: [
              {
                id: 'v1',
                provider_id: 'p1',
                status: 'pending',
                submitted_at: '2026-08-01T00:00:00Z',
                reviewed_at: null,
                rejection_reason: null,
                id_document_path: 'p1/id.jpg',
                selfie_path: 'p1/selfie.jpg',
                profiles: { full_name: 'Juan Cruz' },
              },
            ],
            error: null,
            count: 1,
          },
        ],
        admin_user_overview: [
          { data: [{ id: 'p1', email: 'juan@test.com' }], error: null },
        ],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      const result = await service.list({});

      expect(result.total).toBe(1);
      expect(result.verifications[0]).toEqual({
        id: 'v1',
        provider_id: 'p1',
        full_name: 'Juan Cruz',
        email: 'juan@test.com',
        status: 'pending',
        submitted_at: '2026-08-01T00:00:00Z',
        reviewed_at: null,
        rejection_reason: null,
        document_type: null,
        documents: ['https://signed/doc', 'https://signed/doc'],
      });
    });
  });

  describe('startIdentitySession', () => {
    const paths = {
      id_document_path: 'p1/id.jpg',
      selfie_path: 'p1/selfie.jpg',
    };

    it('returns the session, key and url, and records a pending row', async () => {
      const stripe = createIdentityStripeMock();
      const { supabase, calls } = createSupabaseMock({
        provider_profiles: [HAS_PROFILE],
        provider_verifications: [{ data: { id: 'v1' }, error: null }],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        stripe.service,
        createAdminActionsMock().mock,
      );

      const result = await service.startIdentitySession(provider, paths);

      expect(result).toMatchObject({
        session_id: 'vs_1',
        ephemeral_key_secret: 'ek_secret',
        url: 'https://verify.stripe.com/s/vs_1',
        publishable_key: 'pk_test_stub',
      });
      expect(stripe.keysCreate).toHaveBeenCalledWith(
        { verification_session: 'vs_1' },
        { apiVersion: expect.any(String) },
      );
      expect(calls.some((c) => c.method === 'insert')).toBe(true);
    });

    it('409s before opening a Stripe session when no provider_profiles row exists', async () => {
      const stripe = createIdentityStripeMock();
      const { supabase } = createSupabaseMock({
        provider_profiles: [NO_PROFILE],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        stripe.service,
        createAdminActionsMock().mock,
      );

      await expect(
        service.startIdentitySession(provider, paths),
      ).rejects.toThrow(ConflictException);
      expect(stripe.sessionsCreate).not.toHaveBeenCalled();
    });

    it('503s and cancels the session when the ephemeral key is refused', async () => {
      const stripe = createIdentityStripeMock();
      stripe.keysCreate.mockRejectedValue(
        stripeError('Invalid Stripe API version: 2025-21-27'),
      );
      const { supabase, calls } = createSupabaseMock({
        provider_profiles: [HAS_PROFILE],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        stripe.service,
        createAdminActionsMock().mock,
      );

      await expect(
        service.startIdentitySession(provider, paths),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(stripe.sessionsCancel).toHaveBeenCalledWith('vs_1');
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('503s without cancelling when the session itself is refused', async () => {
      const stripe = createIdentityStripeMock();
      stripe.sessionsCreate.mockRejectedValue(
        stripeError('Your account is not activated for Identity'),
      );
      const { supabase, calls } = createSupabaseMock({
        provider_profiles: [HAS_PROFILE],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        stripe.service,
        createAdminActionsMock().mock,
      );

      await expect(
        service.startIdentitySession(provider, paths),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(stripe.sessionsCancel).not.toHaveBeenCalled();
      expect(stripe.keysCreate).not.toHaveBeenCalled();
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('still 503s when cancelling the orphaned session also fails', async () => {
      const stripe = createIdentityStripeMock();
      stripe.keysCreate.mockRejectedValue(stripeError('bad version'));
      stripe.sessionsCancel.mockRejectedValue(stripeError('cannot cancel'));
      const { supabase } = createSupabaseMock({
        provider_profiles: [HAS_PROFILE],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        stripe.service,
        createAdminActionsMock().mock,
      );

      await expect(
        service.startIdentitySession(provider, paths),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('does not remap a non-Stripe failure', async () => {
      const stripe = createIdentityStripeMock();
      stripe.sessionsCreate.mockRejectedValue(new Error('socket hang up'));
      const { supabase } = createSupabaseMock({
        provider_profiles: [HAS_PROFILE],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        stripe.service,
        createAdminActionsMock().mock,
      );

      await expect(
        service.startIdentitySession(provider, paths),
      ).rejects.toThrow('socket hang up');
    });

    it('keeps the 400 for a second pending review, and cancels the session', async () => {
      const stripe = createIdentityStripeMock();
      const { supabase } = createSupabaseMock({
        provider_profiles: [HAS_PROFILE],
        provider_verifications: [
          { data: null, error: { message: 'duplicate', code: '23505' } },
        ],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        stripe.service,
        createAdminActionsMock().mock,
      );

      await expect(
        service.startIdentitySession(provider, paths),
      ).rejects.toThrow(BadRequestException);
      expect(stripe.sessionsCancel).toHaveBeenCalledWith('vs_1');
    });
  });
});

describe('namesMatch', () => {
  it('ignores case, accents, punctuation and middle names', () => {
    expect(namesMatch('MARIA SANTOS', 'María Clara Santos')).toBe(true);
    expect(namesMatch('Jose Dela-Cruz', 'José dela Cruz')).toBe(true);
  });

  it('refuses a different or missing name', () => {
    expect(namesMatch('Maria Santos', 'Maria Reyes')).toBe(false);
    expect(namesMatch(' ', 'Maria Reyes')).toBe(false);
  });
});
