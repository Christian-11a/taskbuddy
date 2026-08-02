import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
