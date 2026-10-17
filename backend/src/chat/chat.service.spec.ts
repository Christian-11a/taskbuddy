import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';
import type { SupabaseService } from '../supabase/supabase.service';
import type { PushService } from '../push/push.service';
import type { UploadsService } from '../uploads/uploads.service';

type QueryResult = {
  data: unknown;
  count?: number;
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
    for (const method of [
      'select',
      'eq',
      'order',
      'insert',
      'limit',
      'lt',
      'or',
    ]) {
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
  const rpc = jest.fn((name: string) =>
    Promise.resolve(
      resultsByTable[`rpc:${name}`]?.shift() ?? { data: null, error: null },
    ),
  );
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    from,
    rpc,
  };
}

const ok = (data: unknown): QueryResult => ({ data, error: null });

function createUploadsMock(
  signedUrl: string | null = 'https://signed.example/x',
) {
  return {
    assertOwnedPaths: jest.fn(),
    assertValidImage: jest.fn().mockResolvedValue(undefined),
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
  sendChat: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  return new ChatService(
    supabase,
    uploads as unknown as UploadsService,
    {
      sendChat,
    } as unknown as PushService,
  );
}

/** Lets the fire-and-forget chat push run to its end. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ChatService.adminConversationForJob', () => {
  it('returns no messages for a job with no conversation yet', async () => {
    const { supabase } = createSupabaseMock({
      conversations: [{ data: null, error: null }],
    });
    const service = newChatService(supabase, createUploadsMock());

    await expect(service.adminConversationForJob('j1')).resolves.toEqual({
      messages: [],
      total: 0,
      has_more: false,
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
      messages: [
        { data: [...rows].reverse(), error: null },
        { data: null, error: null, count: 2 },
      ],
    });
    const service = newChatService(
      supabase,
      createUploadsMock('https://signed.example/photo.jpg'),
    );

    const result = await service.adminConversationForJob('j1');

    expect(result).toEqual({
      total: 2,
      has_more: false,
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
    expect(uploads.assertValidImage).toHaveBeenCalledWith(
      'chat-attachments',
      'u1/photo.jpg',
    );
    expect(result).toEqual({
      ...insertedRow,
      attachment_url: 'https://signed.example/photo.jpg',
    });
  });

  it('refuses an attachment that is not a valid uploaded image, inserting nothing', async () => {
    const { supabase, from } = createSupabaseMock({
      conversations: [
        { data: { id: 'c1', client_id: 'u1', provider_id: 'u2' }, error: null },
      ],
    });
    const uploads = createUploadsMock();
    uploads.assertValidImage.mockRejectedValue(
      new BadRequestException('Upload not found: u1/missing.jpg'),
    );
    const service = newChatService(supabase, uploads);

    await expect(
      service.sendMessage(
        { id: 'u1' } as any,
        'c1',
        undefined,
        'u1/missing.jpg',
      ),
    ).rejects.toThrow('Upload not found: u1/missing.jpg');
    expect(from).not.toHaveBeenCalledWith('messages');
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
    expect(uploads.assertValidImage).not.toHaveBeenCalled();
    expect(result).toEqual({ ...insertedRow, attachment_url: null });
  });
});

describe('SendMessageDto.attachment_path', () => {
  const path =
    '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

  async function errorsFor(attachment_path: string) {
    const dto = plainToInstance(SendMessageDto, { attachment_path });
    return validate(dto);
  }

  it.each(['jpg', 'png', 'webp'])('accepts an issued .%s path', async (ext) => {
    await expect(errorsFor(`${path}.${ext}`)).resolves.toHaveLength(0);
  });

  it.each([
    ['a traversal', '../other-user/secret.jpg'],
    ['a non-image extension', `${path}.pdf`],
    ['a made-up name', 'u1/photo.jpg'],
    ['an absolute URL', `https://evil.example/${path}.jpg`],
  ])('rejects %s', async (_label, value) => {
    await expect(errorsFor(value)).resolves.not.toHaveLength(0);
  });
});

describe('ChatService chat alerts (0061)', () => {
  const message = {
    id: 'm9',
    conversation_id: 'c1',
    sender_id: 'u1',
    body: 'On my way',
    attachment_path: null,
    read_at: null,
    created_at: '2026-10-17T00:00:00Z',
  };
  const conversation = {
    id: 'c1',
    job_id: 'j1',
    client_id: 'u1',
    provider_id: 'u2',
  };

  it('pushes the other participant on the chat channel when the window allows', async () => {
    const { supabase, rpc } = createSupabaseMock({
      conversations: [ok(conversation), ok(conversation)],
      messages: [ok(message)],
      'rpc:claim_chat_push': [ok(true)],
    });
    const sendChat = jest.fn().mockResolvedValue(undefined);
    const service = newChatService(supabase, createUploadsMock(), sendChat);

    await service.sendMessage(
      { id: 'u1', full_name: 'Ana' } as any,
      'c1',
      'On my way',
    );
    await settle();

    expect(rpc).toHaveBeenCalledWith('claim_chat_push', {
      p_conversation_id: 'c1',
      p_recipient_id: 'u2',
      p_window_seconds: 60,
    });
    expect(sendChat).toHaveBeenCalledWith('u2', {
      title: 'Ana',
      body: 'On my way',
      data: { conversation_id: 'c1', job_id: 'j1' },
    });
  });

  it('sends nothing while the last push for this chat is recent', async () => {
    const { supabase } = createSupabaseMock({
      conversations: [ok(conversation), ok(conversation)],
      messages: [ok(message)],
      'rpc:claim_chat_push': [ok(false)],
    });
    const sendChat = jest.fn();
    const service = newChatService(supabase, createUploadsMock(), sendChat);

    await service.sendMessage({ id: 'u1' } as any, 'c1', 'Again');
    await settle();

    expect(sendChat).not.toHaveBeenCalled();
  });

  it('adds up unread counts for the Messages badge', async () => {
    const { supabase } = createSupabaseMock({
      'rpc:chat_unread_counts': [
        ok([
          { conversation_id: 'c1', unread: 2 },
          { conversation_id: 'c2', unread: 3 },
        ]),
      ],
    });
    const service = newChatService(supabase, createUploadsMock());

    await expect(service.unreadCounts({ id: 'u2' } as any)).resolves.toEqual({
      total: 5,
      conversations: { c1: 2, c2: 3 },
    });
  });
});
