import { BadRequestException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { Profile } from '../common/types';

type QueryResult = { data: unknown; error: { message: string } | null };

/** Same chainable stand-in as wallet.service.spec.ts — results consumed per `.from()`. */
function createSupabaseMock(results: QueryResult[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const from = jest.fn(() => {
    const result = results.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    for (const method of ['select', 'update', 'upsert', 'eq']) {
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
      const service = new ProfilesService(supabase, createUploadsMock());

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
      const service = new ProfilesService(supabase, createUploadsMock());

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
      const service = new ProfilesService(supabase, createUploadsMock());

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
      const service = new ProfilesService(supabase, uploads);

      await expect(
        service.updateProfile(user, { avatar_url: 'someone-else/photo.jpg' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('clears the avatar when given an empty string', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 'u1' }, error: null },
      ]);
      const service = new ProfilesService(supabase, createUploadsMock());

      await service.updateProfile(user, { avatar_url: '' });

      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toEqual({ avatar_url: null });
    });

    it('leaves other fields untouched when no avatar is sent', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 'u1' }, error: null },
      ]);
      const service = new ProfilesService(supabase, createUploadsMock());

      await service.updateProfile(user, { full_name: 'Ana Cruz' });

      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toEqual({ full_name: 'Ana Cruz' });
    });
  });
});
