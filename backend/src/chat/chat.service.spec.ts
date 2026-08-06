import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { SupabaseService } from '../supabase/supabase.service';

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
    for (const method of ['select', 'eq', 'order']) {
      builder[method] = jest.fn(() => builder);
    }
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return { supabase: { admin: { from } } as unknown as SupabaseService };
}

describe('ChatService.adminConversationForJob', () => {
  it('returns no messages for a job with no conversation yet', async () => {
    const { supabase } = createSupabaseMock({
      conversations: [{ data: null, error: null }],
    });
    const service = new ChatService(supabase);

    await expect(service.adminConversationForJob('j1')).resolves.toEqual({
      messages: [],
    });
  });

  it('returns messages oldest-first with the sender name attached', async () => {
    const rows = [
      {
        id: 'm1',
        sender_id: 'p1',
        body: 'Hi, on my way',
        read_at: null,
        created_at: '2026-08-01T10:00:00Z',
        sender: { full_name: 'Juan Cruz' },
      },
    ];
    const { supabase } = createSupabaseMock({
      conversations: [{ data: { id: 'c1' }, error: null }],
      messages: [{ data: rows, error: null }],
    });
    const service = new ChatService(supabase);

    const result = await service.adminConversationForJob('j1');

    expect(result).toEqual({
      messages: [
        {
          id: 'm1',
          sender_id: 'p1',
          sender_name: 'Juan Cruz',
          body: 'Hi, on my way',
          read_at: null,
          created_at: '2026-08-01T10:00:00Z',
        },
      ],
    });
  });

  it('throws BadRequestException on a messages query error', async () => {
    const { supabase } = createSupabaseMock({
      conversations: [{ data: { id: 'c1' }, error: null }],
      messages: [{ data: null, error: { message: 'boom' } }],
    });
    const service = new ChatService(supabase);

    await expect(service.adminConversationForJob('j1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
