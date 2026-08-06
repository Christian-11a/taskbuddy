import { BadRequestException } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import type { SupabaseService } from '../supabase/supabase.service';

function createSupabaseMock(listResult: {
  data: { name: string; metadata: Record<string, unknown> | null }[] | null;
  error: { message: string } | null;
}) {
  const list = jest.fn().mockResolvedValue(listResult);
  const supabase = {
    admin: { storage: { from: jest.fn(() => ({ list })) } },
  } as unknown as SupabaseService;
  return { supabase, list };
}

describe('UploadsService.assertValidImage', () => {
  it('passes for an existing, non-empty image object', async () => {
    const { supabase, list } = createSupabaseMock({
      data: [
        { name: 'id.jpg', metadata: { size: 2048, mimetype: 'image/jpeg' } },
      ],
      error: null,
    });
    const service = new UploadsService(supabase);

    await expect(
      service.assertValidImage('verification-docs', 'p1/id.jpg'),
    ).resolves.toBeUndefined();
    expect(list).toHaveBeenCalledWith('p1', { search: 'id.jpg', limit: 1 });
  });

  it('rejects when the object was never uploaded', async () => {
    const { supabase } = createSupabaseMock({ data: [], error: null });
    const service = new UploadsService(supabase);

    await expect(
      service.assertValidImage('verification-docs', 'p1/missing.jpg'),
    ).rejects.toThrow(/Upload not found/);
  });

  it('rejects a zero-byte object', async () => {
    const { supabase } = createSupabaseMock({
      data: [{ name: 'id.jpg', metadata: { size: 0, mimetype: 'image/jpeg' } }],
      error: null,
    });
    const service = new UploadsService(supabase);

    await expect(
      service.assertValidImage('verification-docs', 'p1/id.jpg'),
    ).rejects.toThrow(/empty/);
  });

  it('rejects a non-image mimetype', async () => {
    const { supabase } = createSupabaseMock({
      data: [
        {
          name: 'id.pdf',
          metadata: { size: 2048, mimetype: 'application/pdf' },
        },
      ],
      error: null,
    });
    const service = new UploadsService(supabase);

    await expect(
      service.assertValidImage('verification-docs', 'p1/id.pdf'),
    ).rejects.toThrow(/not a recognizable image/);
  });

  it('surfaces a storage error as BadRequestException', async () => {
    const { supabase } = createSupabaseMock({
      data: null,
      error: { message: 'bucket not found' },
    });
    const service = new UploadsService(supabase);

    await expect(
      service.assertValidImage('verification-docs', 'p1/id.jpg'),
    ).rejects.toThrow(BadRequestException);
  });
});
