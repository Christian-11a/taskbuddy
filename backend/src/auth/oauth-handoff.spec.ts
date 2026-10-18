import * as crypto from 'crypto';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { SupabaseService } from '../supabase/supabase.service';

/**
 * The one-time handoff that replaced tokens-in-the-deep-link (§19,
 * migrations 0033 and 0071). A session can be collected exactly once, only
 * by a caller holding the id, the secret from the redirect AND the verifier
 * behind the challenge sent at authorize, and never after five minutes.
 */

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALLBACK_URL: 'https://api.test/auth/google/callback',
  GOOGLE_STATE_SECRET: 'a'.repeat(64),
};

const APP_REDIRECT = 'taskbuddy://';
const HANDOFF_ID = 'handoff-0123456789abcdef';
const VERIFIER = 'verifier-' + 'v'.repeat(40);
const SESSION = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_at: 123,
};

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');
const CHALLENGE = sha256(VERIFIER);

type Row = {
  session: unknown;
  expires_at: string;
  challenge: string | null;
  secret_hash: string | null;
};

/**
 * A stand-in for the one table this path touches. `rows` is the store, keyed
 * by code hash. A claim's delete matches only when every `.eq()` agrees.
 */
function createHandoffSupabaseMock(
  options: {
    rows?: Map<string, Row>;
    deleteError?: { message: string };
    insertError?: { message: string };
  } = {},
) {
  const rows = options.rows ?? new Map<string, Row>();
  const insert = jest.fn((row: Row & { code_hash: string }) => {
    if (rows.has(row.code_hash))
      return Promise.resolve({ error: { message: 'duplicate key' } });
    if (!options.insertError) {
      const { code_hash, ...rest } = row;
      rows.set(code_hash, rest);
    }
    return Promise.resolve({ error: options.insertError ?? null });
  });

  function deleteBuilder() {
    const filters: Record<string, string> = {};
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
    builder.eq = jest.fn((column: string, value: string) => {
      filters[column] = value;
      return builder;
    });
    builder.select = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(() => {
      if (options.deleteError) {
        return Promise.resolve({ data: null, error: options.deleteError });
      }
      const row = rows.get(filters.code_hash);
      const matches =
        row &&
        row.secret_hash === filters.secret_hash &&
        row.challenge === filters.challenge;
      if (!matches) return Promise.resolve({ data: null, error: null });
      rows.delete(filters.code_hash);
      return Promise.resolve({ data: row, error: null });
    });
    return builder;
  }

  const supabase = {
    admin: {
      from: jest.fn(() => ({ insert, delete: deleteBuilder })),
    },
  } as unknown as SupabaseService;

  return { supabase, rows, insert };
}

/** Drives the real callback so the handoff is written the way production writes it. */
async function signInWithHandoff(
  service: AuthService,
  handoffId = HANDOFF_ID,
  challenge = CHALLENGE,
) {
  const url = new URL(
    service.buildGoogleAuthUrl(APP_REDIRECT, handoffId, challenge),
  );
  const state = url.searchParams.get('state')!;
  return service.handleGoogleCallback('auth-code', state);
}

const parked = (overrides: Partial<Row> = {}): Map<string, Row> =>
  new Map([
    [
      sha256(HANDOFF_ID),
      {
        session: SESSION,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        challenge: CHALLENGE,
        secret_hash: sha256('secret-' + 's'.repeat(40)),
        ...overrides,
      },
    ],
  ]);
const SECRET = 'secret-' + 's'.repeat(40);

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
    });

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

  it('parks the session bound to the challenge and a fresh secret', async () => {
    const { supabase, rows, insert } = createHandoffSupabaseMock();
    mockUpstream(supabase);
    const service = new AuthService(supabase);

    const result = await signInWithHandoff(service);

    expect(result.handoffId).toBe(HANDOFF_ID);
    expect(result.handoffSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const written = insert.mock.calls[0][0];
    // The id and secret are bearer credentials: only their hashes are stored.
    expect(written.code_hash).toBe(sha256(HANDOFF_ID));
    expect(written.secret_hash).toBe(sha256(result.handoffSecret!));
    expect(written.challenge).toBe(CHALLENGE);
    expect(JSON.stringify(written)).not.toContain(HANDOFF_ID);
    expect(JSON.stringify(written)).not.toContain(result.handoffSecret);
    expect(rows.get(sha256(HANDOFF_ID))?.session).toEqual(SESSION);
  });

  it('returns no handoff when the app did not ask for one', async () => {
    const { supabase, insert } = createHandoffSupabaseMock();
    mockUpstream(supabase);
    const service = new AuthService(supabase);

    const url = new URL(service.buildGoogleAuthUrl(APP_REDIRECT));
    const result = await service.handleGoogleCallback(
      'auth-code',
      url.searchParams.get('state')!,
    );

    expect(result.handoffId).toBeUndefined();
    expect(result.handoffSecret).toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([undefined, 'not-a-hash', 'A'.repeat(64)])(
    'refuses a handoff without a valid challenge (%s): the build is too old',
    (challenge) => {
      const service = new AuthService(createHandoffSupabaseMock().supabase);
      expect(() =>
        service.buildGoogleAuthUrl(APP_REDIRECT, HANDOFF_ID, challenge),
      ).toThrow(BadRequestException);
    },
  );

  it('never overwrites a handoff id that is already parked', async () => {
    const rows = parked();
    const { supabase } = createHandoffSupabaseMock({ rows });
    mockUpstream(supabase);
    const service = new AuthService(supabase);

    await expect(signInWithHandoff(service)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(rows.get(sha256(HANDOFF_ID))?.secret_hash).toBe(sha256(SECRET));
  });

  it('hands the session to the first full claim and nothing to the second', async () => {
    const service = new AuthService(
      createHandoffSupabaseMock({ rows: parked() }).supabase,
    );

    await expect(
      service.claimGoogleHandoff(HANDOFF_ID, SECRET, VERIFIER),
    ).resolves.toEqual({ session: SESSION });
    await expect(
      service.claimGoogleHandoff(HANDOFF_ID, SECRET, VERIFIER),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses the fixation attack: the starter has the id and verifier but not the secret', async () => {
    const rows = parked();
    const service = new AuthService(
      createHandoffSupabaseMock({ rows }).supabase,
    );

    await expect(
      service.claimGoogleHandoff(
        HANDOFF_ID,
        'guessed-' + 'x'.repeat(40),
        VERIFIER,
      ),
    ).rejects.toThrow(NotFoundException);
    // A failed claim does not burn the real one.
    expect(rows.has(sha256(HANDOFF_ID))).toBe(true);
  });

  it('refuses an interceptor: it has the id and secret but not the verifier', async () => {
    const service = new AuthService(
      createHandoffSupabaseMock({ rows: parked() }).supabase,
    );

    await expect(
      service.claimGoogleHandoff(HANDOFF_ID, SECRET, 'other-' + 'y'.repeat(40)),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses a row parked before 0071 (no challenge or secret)', async () => {
    const service = new AuthService(
      createHandoffSupabaseMock({
        rows: parked({ challenge: null, secret_hash: null }),
      }).supabase,
    );

    await expect(
      service.claimGoogleHandoff(HANDOFF_ID, SECRET, VERIFIER),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses a session parked more than five minutes ago', async () => {
    const rows = parked({
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    });
    const service = new AuthService(
      createHandoffSupabaseMock({ rows }).supabase,
    );

    await expect(
      service.claimGoogleHandoff(HANDOFF_ID, SECRET, VERIFIER),
    ).rejects.toThrow(NotFoundException);
    // Swept, not left to accumulate.
    expect(rows.size).toBe(0);
  });

  it('answers 503 rather than a false expiry when the database is unreachable', async () => {
    const service = new AuthService(
      createHandoffSupabaseMock({ deleteError: { message: 'down' } }).supabase,
    );

    await expect(
      service.claimGoogleHandoff(HANDOFF_ID, SECRET, VERIFIER),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('reports a failure when the session cannot be parked', async () => {
    const { supabase } = createHandoffSupabaseMock({
      insertError: { message: 'insert failed' },
    });
    mockUpstream(supabase);
    const service = new AuthService(supabase);

    // The controller turns this into a google_error on the redirect, so the
    // app shows a failed sign-in instead of waiting on a claim that cannot work.
    await expect(signInWithHandoff(service)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
