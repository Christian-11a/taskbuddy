import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { WalletService } from '../wallet/wallet.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

/** Same chainable stand-in as wallet.service.spec.ts — results consumed per `.from()`. */
function createSupabaseMock(results: QueryResult[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    calls.push({ method: 'from', args: [table] });
    const result = results.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    for (const method of ['select', 'update', 'upsert', 'eq', 'or', 'in']) {
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
  const authAdmin = {
    updateUserById: jest.fn(() => Promise.resolve({ error: null })),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
  };
  return {
    supabase: {
      admin: { from, auth: { admin: authAdmin } },
    } as unknown as SupabaseService,
    calls,
    authAdmin,
  };
}

/** Only `balanceFor` matters to deletion; the rest of WalletService does not. */
function createWalletMock(balance: number): WalletService {
  return {
    balanceFor: jest.fn(() => Promise.resolve(balance)),
  } as unknown as WalletService;
}

function createUploadsMock(): UploadsService {
  return {
    assertOwnedPaths: jest.fn(),
    publicUrl: jest.fn(
      (bucket: string, path: string) => `https://cdn/${bucket}/${path}`,
    ),
  } as unknown as UploadsService;
}

const user = { id: 'u1', role: 'client' } as Profile;

describe('ProfilesService', () => {
  describe('updateProfile — avatar_url', () => {
    it('converts a Storage path to a public URL', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 'u1' }, error: null },
      ]);
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(0),
      );

      await service.updateProfile(user, { avatar_url: 'u1/photo.jpg' });

      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toEqual({
        avatar_url: 'https://cdn/avatars/u1/photo.jpg',
      });
    });

    it('passes an https URL through — this is what Google sign-in supplies', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 'u1' }, error: null },
      ]);
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(0),
      );

      await service.updateProfile(user, {
        avatar_url: 'https://lh3.googleusercontent.com/a/abc',
      });

      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toEqual({
        avatar_url: 'https://lh3.googleusercontent.com/a/abc',
      });
    });

    it('refuses a plaintext http URL', async () => {
      const { supabase } = createSupabaseMock([]);
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(0),
      );

      await expect(
        service.updateProfile(user, { avatar_url: 'http://tracker/pixel.gif' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a path belonging to another user', async () => {
      // Without the ownership check, passing someone else's path silently
      // adopts their photo.
      const uploads = createUploadsMock();
      (uploads.assertOwnedPaths as jest.Mock).mockImplementation(() => {
        throw new BadRequestException('Upload path does not belong');
      });
      const { supabase } = createSupabaseMock([]);
      const service = new ProfilesService(
        supabase,
        uploads,
        createWalletMock(0),
      );

      await expect(
        service.updateProfile(user, { avatar_url: 'someone-else/photo.jpg' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('clears the avatar when given an empty string', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 'u1' }, error: null },
      ]);
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(0),
      );

      await service.updateProfile(user, { avatar_url: '' });

      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toEqual({ avatar_url: null });
    });

    it('leaves other fields untouched when no avatar is sent', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 'u1' }, error: null },
      ]);
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(0),
      );

      await service.updateProfile(user, { full_name: 'Ana Cruz' });

      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toEqual({ full_name: 'Ana Cruz' });
    });
  });
  describe('deleteAccount', () => {
    /**
     * The four reads deletionBlockers() runs, in the order Promise.all
     * resolves them: pending withdrawals, escrow rows, active jobs. The
     * balance comes from the wallet mock, not from this list.
     */
    function clearResults(): QueryResult[] {
      return [
        { data: null, error: null, count: 0 }, // pending withdrawals
        { data: [], error: null }, // escrow held/disputed
        { data: null, error: null, count: 0 }, // active jobs
        { data: null, error: null }, // profiles update
      ];
    }

    it('soft-deletes and scrubs identifying fields rather than removing the row', async () => {
      const { supabase, calls } = createSupabaseMock(clearResults());
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(0),
      );

      await expect(service.deleteAccount(user, 'token')).resolves.toEqual({
        deleted: true,
      });

      const update = calls.find((c) => c.method === 'update');
      const patch = update?.args[0] as Record<string, unknown>;
      // The row has to survive: the ledger, reviews and ML snapshots point at
      // it. Erasure is the scrub, not the absence.
      expect(calls.some((c) => c.method === 'delete')).toBe(false);
      expect(patch.deleted_at).toEqual(expect.any(String));
      // Every existing suspension check reads this one, so setting it is what
      // actually locks the account out.
      expect(patch.deactivated_at).toEqual(expect.any(String));
      expect(patch).toMatchObject({
        full_name: 'Deleted user',
        phone: null,
        avatar_url: null,
        address: null,
      });
    });

    it('rotates the auth email and bans the user so the address can be reused', async () => {
      const { supabase, authAdmin } = createSupabaseMock(clearResults());
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(0),
      );

      await service.deleteAccount(user, 'token');

      expect(authAdmin.updateUserById).toHaveBeenCalledWith('u1', {
        email: 'deleted-u1@deleted.invalid',
        ban_duration: expect.any(String),
      });
      // The token in the app's hand stops working now, not at expiry.
      expect(authAdmin.signOut).toHaveBeenCalledWith('token');
    });

    it('refuses with a 409 while the wallet still holds money', async () => {
      const { supabase, calls } = createSupabaseMock(clearResults());
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(250.5),
      );

      await expect(service.deleteAccount(user, 'token')).rejects.toThrow(
        ConflictException,
      );
      expect(calls.some((c) => c.method === 'update')).toBe(false);
    });

    it('reports every blocker at once, not one per attempt', async () => {
      const { supabase } = createSupabaseMock([
        { data: null, error: null, count: 1 }, // a pending withdrawal
        { data: [{ status: 'held' }, { status: 'disputed' }], error: null },
        { data: null, error: null, count: 2 }, // active jobs
      ]);
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(100),
      );

      await expect(service.deleteAccount(user, 'token')).rejects.toMatchObject({
        response: {
          blockers: [
            { code: 'wallet_balance' },
            { code: 'pending_withdrawal' },
            { code: 'escrow_held' },
            { code: 'open_dispute' },
            { code: 'active_job' },
          ],
        },
      });
    });

    it('takes a deleted provider out of the marketplace', async () => {
      const { supabase, calls } = createSupabaseMock([
        ...clearResults(),
        { data: null, error: null }, // provider_profiles update
      ]);
      const service = new ProfilesService(
        supabase,
        createUploadsMock(),
        createWalletMock(0),
      );

      await service.deleteAccount({ ...user, role: 'provider' }, 't');

      expect(
        calls.some(
          (c) => c.method === 'from' && c.args[0] === 'provider_profiles',
        ),
      ).toBe(true);
      const availability = calls
        .filter((c) => c.method === 'update')
        .map((c) => c.args[0] as Record<string, unknown>);
      expect(availability).toContainEqual({ is_available: false });
    });
  });
});
