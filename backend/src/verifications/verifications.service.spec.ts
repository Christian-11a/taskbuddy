import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VerificationsService } from './verifications.service';
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
function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
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
  return { supabase: { admin: { from } } as unknown as SupabaseService, calls };
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
  const service = {
    stripe: {
      identity: {
        verificationSessions: {
          create: sessionsCreate,
          cancel: sessionsCancel,
        },
      },
      ephemeralKeys: { create: keysCreate },
    },
    publishableKey: 'pk_test_stub',
  } as unknown as StripeService;
  return { service, sessionsCreate, sessionsCancel, keysCreate };
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

  describe('approve', () => {
    it('marks the provider verified and notifies them', async () => {
      const pending = {
        id: 'v1',
        provider_id: 'p1',
        status: 'pending',
        id_document_path: 'p1/id.jpg',
        selfie_path: 'p1/selfie.jpg',
      };
      const { supabase, calls } = createSupabaseMock({
        provider_verifications: [
          { data: pending, error: null },
          { data: { ...pending, status: 'approved' }, error: null },
        ],
        provider_profiles: [
          HAS_PROFILE,
          { data: [{ profile_id: 'p1' }], error: null },
        ],
        notifications: [{ data: null, error: null }],
      });
      const { mock: adminActions, record } = createAdminActionsMock();
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        adminActions,
      );

      const result = await service.approve(admin, 'v1');

      expect(result).toMatchObject({ status: 'approved' });
      const verifiedUpdate = calls.find(
        (c) => c.table === 'provider_profiles' && c.method === 'update',
      );
      expect(verifiedUpdate?.args[0]).toEqual({ is_verified: true });
      expect(
        calls.some((c) => c.table === 'notifications' && c.method === 'insert'),
      ).toBe(true);
      expect(record).toHaveBeenCalledWith(
        admin,
        'verification.approve',
        'provider_verifications',
        'v1',
      );
    });

    it('refuses a verification that was already reviewed', async () => {
      const { supabase } = createSupabaseMock({
        provider_verifications: [
          {
            data: { id: 'v1', provider_id: 'p1', status: 'approved' },
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

      await expect(service.approve(admin, 'v1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s when the verification does not exist', async () => {
      const { supabase } = createSupabaseMock({
        provider_verifications: [{ data: null, error: null }],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await expect(service.approve(admin, 'v1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses with 409, and leaves the review pending, when the provider has no provider_profiles row', async () => {
      const pending = { id: 'v1', provider_id: 'p1', status: 'pending' };
      const { supabase, calls } = createSupabaseMock({
        provider_verifications: [{ data: pending, error: null }],
        provider_profiles: [NO_PROFILE],
      });
      const { mock: adminActions, record } = createAdminActionsMock();
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        adminActions,
      );

      await expect(service.approve(admin, 'v1')).rejects.toThrow(
        ConflictException,
      );
      // The review is never marked approved, so the admin can approve it later.
      expect(
        calls.some(
          (c) => c.table === 'provider_verifications' && c.method === 'update',
        ),
      ).toBe(false);
      expect(calls.some((c) => c.table === 'notifications')).toBe(false);
      expect(record).not.toHaveBeenCalled();
    });

    it('surfaces a failed is_verified write instead of reporting success', async () => {
      const pending = { id: 'v1', provider_id: 'p1', status: 'pending' };
      const { supabase } = createSupabaseMock({
        provider_verifications: [
          { data: pending, error: null },
          { data: { ...pending, status: 'approved' }, error: null },
        ],
        provider_profiles: [
          HAS_PROFILE,
          { data: null, error: { message: 'boom' } },
        ],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
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

    it('approves and sets is_verified when the row exists', async () => {
      const { supabase, calls } = createSupabaseMock({
        provider_verifications: [
          { data: pendingIdentity, error: null },
          { data: { ...pendingIdentity, status: 'approved' }, error: null },
        ],
        provider_profiles: [
          HAS_PROFILE,
          { data: [{ profile_id: 'p1' }], error: null },
        ],
        notifications: [{ data: null, error: null }],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await service.applyIdentityResult('vs_1', 'verified');

      const verifiedUpdate = calls.find(
        (c) => c.table === 'provider_profiles' && c.method === 'update',
      );
      expect(verifiedUpdate?.args[0]).toEqual({ is_verified: true });
    });

    it('still records a rejection without needing the row', async () => {
      const { supabase, calls } = createSupabaseMock({
        provider_verifications: [
          { data: pendingIdentity, error: null },
          { data: { ...pendingIdentity, status: 'rejected' }, error: null },
        ],
        notifications: [{ data: null, error: null }],
      });
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        createAdminActionsMock().mock,
      );

      await service.applyIdentityResult('vs_1', 'rejected', 'Expired ID');

      expect(calls.some((c) => c.table === 'provider_profiles')).toBe(false);
    });
  });

  describe('reject', () => {
    it('stores the reason and leaves is_verified untouched', async () => {
      const pending = { id: 'v1', provider_id: 'p1', status: 'pending' };
      const { supabase, calls } = createSupabaseMock({
        provider_verifications: [
          { data: pending, error: null },
          { data: { ...pending, status: 'rejected' }, error: null },
        ],
        notifications: [{ data: null, error: null }],
      });
      const { mock: adminActions, record } = createAdminActionsMock();
      const service = new VerificationsService(
        supabase,
        createUploadsMock(),
        createStripeMock(),
        adminActions,
      );

      await service.reject(admin, 'v1', { reason: 'Blurry photo' });

      const update = calls.find(
        (c) => c.table === 'provider_verifications' && c.method === 'update',
      );
      expect(update?.args[0]).toMatchObject({
        status: 'rejected',
        rejection_reason: 'Blurry photo',
        reviewed_by: 'a1',
      });
      expect(calls.some((c) => c.table === 'provider_profiles')).toBe(false);
      expect(record).toHaveBeenCalledWith(
        admin,
        'verification.reject',
        'provider_verifications',
        'v1',
        { reason: 'Blurry photo' },
      );
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
