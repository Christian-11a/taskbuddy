import * as crypto from 'crypto';
import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { SupabaseService } from '../supabase/supabase.service';

/**
 * The one-time handoff that replaced tokens-in-the-deep-link (§19,
 * migration 0033). What matters here is that a session can be collected
 * exactly once, by whoever holds the id, and never after five minutes.
 */

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALLBACK_URL: 'https://api.test/auth/google/callback',
  GOOGLE_STATE_SECRET: 'a'.repeat(64),
};

const APP_REDIRECT = 'taskbuddy://';
const HANDOFF_ID = 'handoff-0123456789abcdef';
const SESSION = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_at: 123,
};

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

/**
 * A stand-in for the one table this path touches. `rows` is the store, keyed
 * by code hash, so a test can assert what was written and what a claim left
 * behind.
 */
function createHandoffSupabaseMock(
  options: {
    rows?: Map<string, { session: unknown; expires_at: string }>;
    deleteError?: { message: string };
    upsertError?: { message: string };
  } = {},
) {
  const rows =
    options.rows ?? new Map<string, { session: unknown; expires_at: string }>();
  const upsert = jest.fn(
    (row: { code_hash: string; session: unknown; expires_at: string }) => {
      if (!options.upsertError) {
        rows.set(row.code_hash, {
          session: row.session,
          expires_at: row.expires_at,
        });
      }
      return Promise.resolve({ error: options.upsertError ?? null });
    },
  );

  function deleteBuilder() {
    let matched: string | null = null;
    const builder: Record<string, unknown> = {};
    // The expiry sweep: .lt() is awaited directly, with no .select().
    builder.lt = jest.fn((_column: string, value: string) => {
      for (const [hash, row] of rows) {
        if (new Date(row.expires_at).getTime() < new Date(value).getTime()) {
          rows.delete(hash);
        }
      }
      return Promise.resolve({ error: options.deleteError ?? null });
    });
    builder.eq = jest.fn((_column: string, value: string) => {
      matched = value;
      return builder;
    });
    builder.select = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(() => {
      if (options.deleteError) {
        return Promise.resolve({ data: null, error: options.deleteError });
      }
      const row = matched ? rows.get(matched) : undefined;
      if (matched) rows.delete(matched);
      return Promise.resolve({ data: row ?? null, error: null });
    });
    return builder;
  }

  const supabase = {
    admin: {
      from: jest.fn(() => ({ upsert, delete: deleteBuilder })),
    },
  } as unknown as SupabaseService;

  return { supabase, rows, upsert };
}

/** Drives the real callback so the handoff is written the way production writes it. */
async function signInWithHandoff(
  service: AuthService,
  handoffId = HANDOFF_ID,
) {
  const url = new URL(service.buildGoogleAuthUrl(APP_REDIRECT, handoffId));
  const state = url.searchParams.get('state')!;
  return service.handleGoogleCallback('auth-code', state);
}

describe('Google sign-in handoff', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, ...GOOGLE_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  /** Google's token endpoint plus Supabase's id-token sign-in. */
  function mockUpstream(supabase: SupabaseService) {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ id_token: 'id-token' }),
    }) as unknown as typeof fetch;

    const admin = supabase as unknown as {
      anon: unknown;
      admin: { from: jest.Mock };
    };
    const profileBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: { deactivated_at: null }, error: null }),
    };
    const handoffFrom = admin.admin.from;
    admin.admin.from = jest.fn((table: string) =>
      table === 'profiles' ? profileBuilder : handoffFrom(table),
    ) as jest.Mock;
    admin.anon = {
      auth: {
        signInWithIdToken: jest.fn().mockResolvedValue({
          data: { user: { id: 'u1' }, session: SESSION },
          error: null,
        }),
      },
    };
  }

  it('carries the handoff id through the signed state and parks the session', async () => {
    const { supabase, rows, upsert } = createHandoffSupabaseMock();
    mockUpstream(supabase);
    const service = new AuthService(supabase);

    const result = await signInWithHandoff(service);

    expect(result.handoffId).toBe(HANDOFF_ID);
    // The id is a bearer credential: only its hash may be stored.
    expect(upsert.mock.calls[0][0].code_hash).toBe(sha256(HANDOFF_ID));
    expect(JSON.stringify(upsert.mock.calls[0][0])).not.toContain(HANDOFF_ID);
    expect(rows.get(sha256(HANDOFF_ID))?.session).toEqual(SESSION);
  });

  it('returns no handoff id when the app did not ask for one', async () => {
    const { supabase, upsert } = createHandoffSupabaseMock();
    mockUpstream(supabase);
    const service = new AuthService(supabase);

    const url = new URL(service.buildGoogleAuthUrl(APP_REDIRECT));
    const result = await service.handleGoogleCallback(
      'auth-code',
      url.searchParams.get('state')!,
    );

    expect(result.handoffId).toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('hands the session to the first claim and nothing to the second', async () => {
    const rows = new Map([
      [
        sha256(HANDOFF_ID),
        {
          session: SESSION,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    ]);
    const service = new AuthService(createHandoffSupabaseMock({ rows }).supabase);

    await expect(service.claimGoogleHandoff(HANDOFF_ID)).resolves.toEqual({
      session: SESSION,
    });
    await expect(service.claimGoogleHandoff(HANDOFF_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses an id that was never issued', async () => {
    const service = new AuthService(createHandoffSupabaseMock().supabase);

    await expect(service.claimGoogleHandoff('not-a-real-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses a session parked more than five minutes ago', async () => {
    const rows = new Map([
      [
        sha256(HANDOFF_ID),
        {
          session: SESSION,
          expires_at: new Date(Date.now() - 1_000).toISOString(),
        },
      ],
    ]);
    const service = new AuthService(createHandoffSupabaseMock({ rows }).supabase);

    await expect(service.claimGoogleHandoff(HANDOFF_ID)).rejects.toThrow(
      NotFoundException,
    );
    // Swept, not left to accumulate.
    expect(rows.size).toBe(0);
  });

  it('answers 503 rather than a false expiry when the database is unreachable', async () => {
    const service = new AuthService(
      createHandoffSupabaseMock({ deleteError: { message: 'down' } }).supabase,
    );

    await expect(service.claimGoogleHandoff(HANDOFF_ID)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('still signs the user in when parking the session fails', async () => {
    const { supabase } = createHandoffSupabaseMock({
      upsertError: { message: 'insert failed' },
    });
    mockUpstream(supabase);
    const service = new AuthService(supabase);

    // The claim will 404 and the app reports a failed sign-in — far better
    // than a 500 in the browser with a live session already minted.
    await expect(signInWithHandoff(service)).resolves.toMatchObject({
      session: SESSION,
    });
  });
});
