import { PortfolioService } from './portfolio.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { Profile } from '../common/types';
const owner = { id: 'owner', role: 'provider' } as Profile;
function setup(data: unknown = [], error: unknown = null) {
  const builder: Record<string, jest.Mock> = {};
  for (const name of ['select', 'eq', 'order', 'insert', 'update', 'delete'])
    builder[name] = jest.fn(() => builder);
  builder.single = jest.fn().mockResolvedValue({ data, error });
  builder.maybeSingle = builder.single;
  const from = jest.fn((table: string) =>
    table === 'profiles'
      ? {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: 'owner',
                    role: 'provider',
                    deleted_at: null,
                    deactivated_at: null,
                  },
                  error: null,
                }),
            }),
          }),
        }
      : builder,
  );

  // Keep the awaited builder thenable across every chain method.
  Object.assign(builder, {
    then: (resolve: (result: unknown) => void) =>
      Promise.resolve({ data, error }).then(resolve),
  });
  const uploads = {
    assertOwnedPaths: jest.fn(),
    assertValidImage: jest.fn().mockResolvedValue(undefined),
    signedDownloadUrl: jest.fn().mockResolvedValue('signed-image'),
  };
  const service = new PortfolioService(
    { admin: { from } } as unknown as SupabaseService,
    uploads as unknown as UploadsService,
  );
  return { service, builder, uploads, from };
}
it('allows clients and the owner, rejects other providers before querying', async () => {
  const { service, from } = setup();
  await expect(
    service.list({ id: 'other', role: 'provider' } as Profile, 'owner'),
  ).rejects.toThrow('Portfolio access');
  expect(from).not.toHaveBeenCalled();
  await expect(service.list(owner, 'owner')).resolves.toEqual([]);
  await expect(
    service.list({ id: 'client', role: 'client' } as Profile, 'owner'),
  ).resolves.toEqual([]);
});
it('issues signed URLs only for published entries and does not expose storage paths', async () => {
  const { service, uploads } = setup([
    { id: 'photo', image_path: 'owner/photo.jpg', caption: 'Work' },
  ]);
  await expect(service.list(owner, 'owner')).resolves.toEqual([
    { id: 'photo', caption: 'Work', image_url: 'signed-image' },
  ]);
  expect(uploads.signedDownloadUrl).toHaveBeenCalledWith(
    'provider-portfolio',
    'owner/photo.jpg',
    3600,
  );
});
it('reports unreadable images explicitly', async () => {
  const { service, uploads } = setup([{ image_path: 'owner/photo.jpg' }]);
  uploads.signedDownloadUrl.mockResolvedValue(null);
  await expect(service.list(owner, 'owner')).rejects.toThrow('Could not load');
});
it('checks ownership and actual image validity before publication', async () => {
  const { service, uploads, builder } = setup({ id: 'new' });
  await service.create(owner, {
    image_path: 'owner/photo.jpg',
    caption: ' Work ',
    position: 0,
  });
  expect(uploads.assertOwnedPaths).toHaveBeenCalledWith(owner, [
    'owner/photo.jpg',
  ]);
  expect(uploads.assertValidImage).toHaveBeenCalledWith(
    'provider-portfolio',
    'owner/photo.jpg',
  );
  expect(builder.insert).toHaveBeenCalledWith({
    provider_id: 'owner',
    image_path: 'owner/photo.jpg',
    caption: 'Work',
    position: 0,
  });
  uploads.assertValidImage.mockRejectedValue(new Error('Not an image'));
  await expect(
    service.create(owner, {
      image_path: 'owner/bad',
      caption: 'Work',
      position: 0,
    }),
  ).rejects.toThrow('Not an image');
  expect(builder.insert).toHaveBeenCalledTimes(1);
});
it('scopes updates/removal to the authenticated owner and rejects absent entries', async () => {
  const { service, builder } = setup(null);
  await expect(
    service.update(owner, 'foreign', { caption: 'Work', position: 1 }),
  ).rejects.toThrow('not found');
  await expect(service.remove(owner, 'foreign')).rejects.toThrow('not found');
  expect(builder.eq).toHaveBeenCalledWith('provider_id', 'owner');
});
it('surfaces database failures', async () => {
  const { service } = setup(null, { message: 'Database unavailable' });
  await expect(service.list(owner, 'owner')).rejects.toThrow(
    'Database unavailable',
  );
  await expect(service.remove(owner, 'id')).rejects.toThrow(
    'Database unavailable',
  );
});

it('hides deleted provider portfolios before issuing image URLs', async () => {
  const { service, from, uploads } = setup([{ image_path: 'owner/photo.jpg' }]);
  from.mockImplementationOnce(
    () =>
      ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { role: 'provider', deleted_at: '2026-10-04' },
                error: null,
              }),
          }),
        }),
      }) as never,
  );
  await expect(
    service.list({ id: 'client', role: 'client' } as Profile, 'owner'),
  ).rejects.toThrow('Provider not found');
  expect(uploads.signedDownloadUrl).not.toHaveBeenCalled();
});
