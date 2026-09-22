import { BadRequestException } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import type { SupabaseService } from '../supabase/supabase.service';

function createSupabaseMock(
  listResult: {
    data: { name: string; metadata: Record<string, unknown> | null }[] | null;
    error: { message: string } | null;
  },
  fileBytes: number[] = [],
) {
  const list = jest.fn().mockResolvedValue(listResult);
  const download = jest.fn().mockResolvedValue({
    data: new Blob([new Uint8Array(fileBytes)]),
    error: null,
  });
  const supabase = {
    admin: { storage: { from: jest.fn(() => ({ list, download })) } },
  } as unknown as SupabaseService;
  return { supabase, list, download };
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

  it('accepts an octet-stream object whose bytes are a JPEG', async () => {
    const { supabase, download } = createSupabaseMock(
      {
        data: [
          {
            name: 'id.jpg',
            metadata: { size: 2048, mimetype: 'application/octet-stream' },
          },
        ],
        error: null,
      },
      [0xff, 0xd8, 0xff, 0xe0, 0, 0x10],
    );
    const service = new UploadsService(supabase);

    await expect(
      service.assertValidImage('verification-docs', 'p1/id.jpg'),
    ).resolves.toBeUndefined();
    expect(download).toHaveBeenCalledWith('p1/id.jpg');
  });

  it('rejects an octet-stream object whose bytes are not an image', async () => {
    const { supabase } = createSupabaseMock(
      {
        data: [
          {
            name: 'id.jpg',
            metadata: { size: 2048, mimetype: 'application/octet-stream' },
          },
        ],
        error: null,
      },
      [0x25, 0x50, 0x44, 0x46], // %PDF
    );
    const service = new UploadsService(supabase);

    await expect(
      service.assertValidImage('verification-docs', 'p1/id.jpg'),
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
