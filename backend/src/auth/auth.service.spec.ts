import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { SupabaseService } from '../supabase/supabase.service';

const SESSION = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_at: 123,
};

function createSupabaseMock(options: {
  signInError?: { message: string } | null;
  deactivatedAt?: string | null;
}) {
  const signOut = jest.fn().mockResolvedValue({ error: null });
  // login() reads full_name/role off the same suspension lookup, so the web
  // admin console has a display name without a second round trip.
  const maybeSingle = jest.fn().mockResolvedValue({
    data: {
      deactivated_at: options.deactivatedAt ?? null,
      full_name: 'Ana Cruz',
      role: 'client',
    },
    error: null,
  });
  const supabase = {
    anon: {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue(
          options.signInError
            ? { data: {}, error: options.signInError }
            : {
                data: {
                  user: { id: 'u1', email: 'user@test.io' },
                  session: SESSION,
                },
                error: null,
              },
        ),
      },
    },
    admin: {
      auth: { admin: { signOut } },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle,
      })),
    },
  } as unknown as SupabaseService;
  return { supabase, signOut };
}

describe('AuthService.login', () => {
  const dto = { email: 'user@test.io', password: 'secret123' };

  it('returns the session for an active account', async () => {
    const { supabase } = createSupabaseMock({ deactivatedAt: null });
    const service = new AuthService(supabase);

    const result = await service.login(dto);

    expect(result.user).toEqual({
      id: 'u1',
      email: 'user@test.io',
      full_name: 'Ana Cruz',
      role: 'client',
    });
    expect(result.session).toEqual(SESSION);
  });

  it("rejects a suspended account with 'Account suspended' and revokes the session", async () => {
    const { supabase, signOut } = createSupabaseMock({
      deactivatedAt: '2026-07-01T00:00:00Z',
    });
    const service = new AuthService(supabase);

    await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    await expect(service.login(dto)).rejects.toThrow('Account suspended');
    expect(signOut).toHaveBeenCalledWith(SESSION.access_token);
  });

  it('still rejects bad credentials as unauthorized', async () => {
    const { supabase } = createSupabaseMock({
      signInError: { message: 'Invalid login credentials' },
    });
    const service = new AuthService(supabase);

    await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
  });
});

// ── Google server-side OAuth ─────────────────────────────────────────────────

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALLBACK_URL: 'https://api.test/auth/google/callback',
  GOOGLE_STATE_SECRET: 'a'.repeat(64),
};

const APP_REDIRECT = 'exp://192.168.1.42:8081/--/';

function createGoogleSupabaseMock(
  options: {
    idTokenError?: { message: string } | null;
    deactivatedAt?: string | null;
  } = {},
) {
  const signOut = jest.fn().mockResolvedValue({ error: null });
  const supabase = {
    anon: {
      auth: {
        signInWithIdToken: jest.fn().mockResolvedValue(
          options.idTokenError
            ? { data: {}, error: options.idTokenError }
            : {
                data: { user: { id: 'u1' }, session: SESSION },
                error: null,
              },
        ),
      },
    },
    admin: {
      auth: { admin: { signOut } },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { deactivated_at: options.deactivatedAt ?? null },
          error: null,
        }),
      })),
    },
  } as unknown as SupabaseService;
  return { supabase, signOut };
}

/** Runs the real buildGoogleAuthUrl and pulls the signed state back out. */
function issueState(service: AuthService, appRedirect = APP_REDIRECT): string {
  const url = new URL(service.buildGoogleAuthUrl(appRedirect));
  return url.searchParams.get('state')!;
}

function mockGoogleTokenEndpoint(body: Record<string, unknown>) {
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ json: () => Promise.resolve(body) });
  global.fetch = fetchMock;
  return fetchMock;
}

describe('AuthService Google OAuth', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, ...GOOGLE_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('buildGoogleAuthUrl', () => {
    it('sends the hashed nonce to Google and keeps the raw nonce in state', () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);

      const url = new URL(service.buildGoogleAuthUrl(APP_REDIRECT));
      const hashedNonce = url.searchParams.get('nonce')!;
      const state = url.searchParams.get('state')!;
      const payload = JSON.parse(
        Buffer.from(
          state.slice(0, state.lastIndexOf('.')),
          'base64url',
        ).toString(),
      ) as { rawNonce: string; appRedirect: string };

      // Supabase needs the raw nonce; Google must only ever see the hash.
      expect(hashedNonce).toHaveLength(64);
      expect(hashedNonce).not.toBe(payload.rawNonce);
      expect(payload.appRedirect).toBe(APP_REDIRECT);
      expect(url.searchParams.get('redirect_uri')).toBe(
        GOOGLE_ENV.GOOGLE_CALLBACK_URL,
      );
    });

    it('refuses to issue state for a redirect outside the allowlist', () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);

      expect(() => service.buildGoogleAuthUrl('https://evil.example')).toThrow(
        BadRequestException,
      );
    });

    it('reports missing configuration as unavailable rather than a crash', () => {
      delete process.env.GOOGLE_CLIENT_SECRET;
      const service = new AuthService(createGoogleSupabaseMock().supabase);

      expect(() => service.buildGoogleAuthUrl(APP_REDIRECT)).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('handleGoogleCallback', () => {
    it('exchanges the code and returns the session for a valid state', async () => {
      const { supabase } = createGoogleSupabaseMock();
      const service = new AuthService(supabase);
      const state = issueState(service);
      mockGoogleTokenEndpoint({ id_token: 'google-id-token' });

      const result = await service.handleGoogleCallback('auth-code', state);

      expect(result.appRedirect).toBe(APP_REDIRECT);
      expect(result.session).toEqual(SESSION);
      // The code exchange must happen server-to-server, against the same
      // redirect_uri Google saw on the authorize call.
      const sentBody = new URLSearchParams(
        (global.fetch as jest.Mock).mock.calls[0][1].body as string,
      );
      expect(sentBody.get('client_secret')).toBe(
        GOOGLE_ENV.GOOGLE_CLIENT_SECRET,
      );
      expect(sentBody.get('redirect_uri')).toBe(GOOGLE_ENV.GOOGLE_CALLBACK_URL);
    });

    it('rejects a state whose signature was tampered with', async () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);
      const state = issueState(service);
      const forged =
        state.slice(0, state.lastIndexOf('.') + 1) + 'b'.repeat(64);

      await expect(
        service.handleGoogleCallback('auth-code', forged),
      ).rejects.toThrow('Invalid state signature');
    });

    it('rejects a state signed with a different secret', async () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);
      const state = issueState(service);
      process.env.GOOGLE_STATE_SECRET = 'b'.repeat(64);

      await expect(
        service.handleGoogleCallback('auth-code', state),
      ).rejects.toThrow('Invalid state signature');
    });

    it('rejects a non-hex signature instead of decoding it to a short buffer', async () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);
      const state = issueState(service);
      const forged = state.slice(0, state.lastIndexOf('.') + 1) + 'zz';

      await expect(
        service.handleGoogleCallback('auth-code', forged),
      ).rejects.toThrow('Invalid state signature');
    });

    it('rejects an expired state', async () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);
      const state = issueState(service);
      // State carries a 10-minute window.
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);

      await expect(
        service.handleGoogleCallback('auth-code', state),
      ).rejects.toThrow('State expired');

      jest.spyOn(Date, 'now').mockRestore();
    });

    it('surfaces a missing id_token from Google', async () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);
      const state = issueState(service);
      mockGoogleTokenEndpoint({ error_description: 'invalid_client' });

      await expect(
        service.handleGoogleCallback('auth-code', state),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a suspended account and revokes the fresh session', async () => {
      const { supabase, signOut } = createGoogleSupabaseMock({
        deactivatedAt: '2026-07-01T00:00:00Z',
      });
      const service = new AuthService(supabase);
      const state = issueState(service);
      mockGoogleTokenEndpoint({ id_token: 'google-id-token' });

      await expect(
        service.handleGoogleCallback('auth-code', state),
      ).rejects.toThrow(ForbiddenException);
      expect(signOut).toHaveBeenCalledWith(SESSION.access_token);
    });
  });

  describe('tryParseAppRedirect', () => {
    it('returns the redirect from an allowlisted state', () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);

      expect(service.tryParseAppRedirect(issueState(service))).toBe(
        APP_REDIRECT,
      );
    });

    it('returns null for a forged state pointing at a third party', () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);
      // The signature is never checked on this path, so the allowlist is the
      // only thing preventing an open redirect.
      const payload = Buffer.from(
        JSON.stringify({
          appRedirect: 'https://evil.example',
          exp: Date.now(),
        }),
      ).toString('base64url');

      expect(service.tryParseAppRedirect(`${payload}.deadbeef`)).toBeNull();
    });

    it('returns null for unparseable state', () => {
      const service = new AuthService(createGoogleSupabaseMock().supabase);

      expect(service.tryParseAppRedirect('garbage')).toBeNull();
    });
  });
});

describe('AuthService password reset', () => {
  function createResetSupabaseMock(options: {
    resetError?: { message: string } | null;
    verifyError?: { message: string } | null;
    deactivatedAt?: string | null;
    updateError?: { message: string } | null;
  }) {
    const resetPasswordForEmail = jest
      .fn()
      .mockResolvedValue({ error: options.resetError ?? null });
    const verifyOtp = jest.fn().mockResolvedValue(
      options.verifyError
        ? { data: {}, error: options.verifyError }
        : {
            data: { user: { id: 'u1' }, session: SESSION },
            error: null,
          },
    );
    const updateUserById = jest
      .fn()
      .mockResolvedValue({ error: options.updateError ?? null });
    const signOut = jest.fn().mockResolvedValue({ error: null });

    const supabase = {
      anon: { auth: { resetPasswordForEmail, verifyOtp } },
      admin: {
        auth: { admin: { updateUserById, signOut } },
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { deactivated_at: options.deactivatedAt ?? null },
            error: null,
          }),
        })),
      },
    } as unknown as SupabaseService;
    return { supabase, resetPasswordForEmail, verifyOtp, updateUserById };
  }

  describe('forgotPassword', () => {
    it('reports success for an address that has no account', () => {
      // Anything else turns this endpoint into a membership oracle: an
      // unauthenticated caller could enumerate which emails are registered.
      const { supabase } = createResetSupabaseMock({
        resetError: { message: 'User not found' },
      });
      const service = new AuthService(supabase);

      return expect(
        service.forgotPassword({ email: 'nobody@test.io' }),
      ).resolves.toEqual({ success: true });
    });

    it('reports success identically when the email actually sends', async () => {
      const { supabase, resetPasswordForEmail } = createResetSupabaseMock({});
      const service = new AuthService(supabase);

      await expect(
        service.forgotPassword({ email: 'user@test.io' }),
      ).resolves.toEqual({ success: true });
      expect(resetPasswordForEmail).toHaveBeenCalledWith('user@test.io');
    });
  });

  describe('resetPassword', () => {
    const dto = {
      email: 'user@test.io',
      token: '123456',
      new_password: 'newsecret123',
    };

    it('rotates the password and returns a session', async () => {
      const { supabase, updateUserById } = createResetSupabaseMock({});
      const service = new AuthService(supabase);

      await expect(service.resetPassword(dto)).resolves.toEqual({
        session: SESSION,
      });
      expect(updateUserById).toHaveBeenCalledWith('u1', {
        password: 'newsecret123',
      });
    });

    it('rejects an expired or wrong code', async () => {
      const { supabase, updateUserById } = createResetSupabaseMock({
        verifyError: { message: 'Token has expired' },
      });
      const service = new AuthService(supabase);

      await expect(service.resetPassword(dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(updateUserById).not.toHaveBeenCalled();
    });

    it('refuses a suspended account, so reset is not a way back in', async () => {
      const { supabase, updateUserById } = createResetSupabaseMock({
        deactivatedAt: '2026-01-01T00:00:00Z',
      });
      const service = new AuthService(supabase);

      await expect(service.resetPassword(dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(updateUserById).not.toHaveBeenCalled();
    });
  });
});
