import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

/** Same chainable stand-in as admin.service.spec.ts. */
function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
  const from = jest.fn((table: string) => {
    const result = resultsByTable[table]?.shift() ?? {
      data: null,
      error: { message: `no mock result for table '${table}'` },
    };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'insert']) {
      builder[method] = jest.fn(() => builder);
    }
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return { supabase: { admin: { from } } as unknown as SupabaseService };
}

function createUploadsMock(
  signedUrl: string | null = 'https://signed.example/x',
) {
  return {
    assertOwnedPaths: jest.fn(),
    signedDownloadUrl: jest.fn().mockResolvedValue(signedUrl),
  };
}

/** Wraps the ChatService constructor so the uploads mock above can stay a
 * plain jest.fn() object at its call sites — casting it to UploadsService
 * inline would make eslint's unbound-method rule flag every
 * `uploads.assertOwnedPaths` assertion as a class-method reference. */
function newChatService(
  supabase: SupabaseService,
  uploads: ReturnType<typeof createUploadsMock>,
) {
  return new ChatService(supabase, uploads as unknown as UploadsService);
}

describe('ChatService.adminConversationForJob', () => {
  it('returns no messages for a job with no conversation yet', async () => {
    const { supabase } = createSupabaseMock({
      conversations: [{ data: null, error: null }],
    });
    const service = newChatService(supabase, createUploadsMock());

    await expect(service.adminConversationForJob('j1')).resolves.toEqual({
      messages: [],
    });
  });

  it('returns messages oldest-first with the sender name and attachment attached', async () => {
    const rows = [
      {
        id: 'm1',
        sender_id: 'p1',
        body: 'Hi, on my way',
        attachment_path: null,
        read_at: null,
        created_at: '2026-08-01T10:00:00Z',
        sender: { full_name: 'Juan Cruz' },
      },
      {
        id: 'm2',
        sender_id: 'p1',
        body: '',
        attachment_path: 'p1/photo.jpg',
        read_at: null,
        created_at: '2026-08-01T10:05:00Z',
        sender: { full_name: 'Juan Cruz' },
      },
    ];
    const { supabase } = createSupabaseMock({
      conversations: [{ data: { id: 'c1' }, error: null }],
      messages: [{ data: rows, error: null }],
    });
    const service = newChatService(
      supabase,
      createUploadsMock('https://signed.example/photo.jpg'),
    );

    const result = await service.adminConversationForJob('j1');

    expect(result).toEqual({
      messages: [
        {
          id: 'm1',
          sender_id: 'p1',
          sender_name: 'Juan Cruz',
          body: 'Hi, on my way',
          attachment_path: null,
          attachment_url: null,
          read_at: null,
          created_at: '2026-08-01T10:00:00Z',
        },
        {
          id: 'm2',
          sender_id: 'p1',
          sender_name: 'Juan Cruz',
          body: '',
          attachment_path: 'p1/photo.jpg',
          attachment_url: 'https://signed.example/photo.jpg',
          read_at: null,
          created_at: '2026-08-01T10:05:00Z',
        },
      ],
    });
  });

  it('throws BadRequestException on a messages query error', async () => {
    const { supabase } = createSupabaseMock({
      conversations: [{ data: { id: 'c1' }, error: null }],
      messages: [{ data: null, error: { message: 'boom' } }],
    });
    const service = newChatService(supabase, createUploadsMock());

    await expect(service.adminConversationForJob('j1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ChatService.sendMessage', () => {
  it('rejects a message with neither body nor attachment', async () => {
    const { supabase } = createSupabaseMock({
      conversations: [
        { data: { id: 'c1', client_id: 'u1', provider_id: 'u2' }, error: null },
      ],
    });
    const service = newChatService(supabase, createUploadsMock());

    await expect(
      service.sendMessage({ id: 'u1' } as any, 'c1', undefined, undefined),
    ).rejects.toThrow('Message must have text or an attachment.');
  });

  it('stores attachment_path and checks ownership before inserting', async () => {
    const insertedRow = {
      id: 'm1',
      conversation_id: 'c1',
      sender_id: 'u1',
      body: '',
      attachment_path: 'u1/photo.jpg',
      read_at: null,
      created_at: '2026-09-16T00:00:00Z',
    };
    const { supabase } = createSupabaseMock({
      conversations: [
        { data: { id: 'c1', client_id: 'u1', provider_id: 'u2' }, error: null },
      ],
      messages: [{ data: insertedRow, error: null }],
    });
    const uploads = createUploadsMock('https://signed.example/photo.jpg');
    const service = newChatService(supabase, uploads);

    const result = await service.sendMessage(
      { id: 'u1' } as any,
      'c1',
      undefined,
      'u1/photo.jpg',
    );

    expect(uploads.assertOwnedPaths).toHaveBeenCalledWith({ id: 'u1' }, [
      'u1/photo.jpg',
    ]);
    expect(result).toEqual({
      ...insertedRow,
      attachment_url: 'https://signed.example/photo.jpg',
    });
  });

  it('sends a text-only message with attachment_url null', async () => {
    const insertedRow = {
      id: 'm2',
      conversation_id: 'c1',
      sender_id: 'u1',
      body: 'hi',
      attachment_path: null,
      read_at: null,
      created_at: '2026-09-16T00:01:00Z',
    };
    const { supabase } = createSupabaseMock({
      conversations: [
        { data: { id: 'c1', client_id: 'u1', provider_id: 'u2' }, error: null },
      ],
      messages: [{ data: insertedRow, error: null }],
    });
    const uploads = createUploadsMock();
    const service = newChatService(supabase, uploads);

    const result = await service.sendMessage(
      { id: 'u1' } as any,
      'c1',
      'hi',
      undefined,
    );

    expect(uploads.assertOwnedPaths).not.toHaveBeenCalled();
    expect(result).toEqual({ ...insertedRow, attachment_url: null });
  });
});
