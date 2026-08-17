import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Reflector } from '@nestjs/core';

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

function createGuard() {
  const getUser = jest.fn().mockResolvedValue({ data: { user: { id: 'a1' } } });
  const supabase = {
    admin: {
      auth: { getUser },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'a1', role: 'admin', deactivated_at: null },
          error: null,
        }),
      })),
    },
  } as unknown as SupabaseService;
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  return { guard: new JwtAuthGuard(supabase, reflector), getUser };
}

describe('JwtAuthGuard browser authentication', () => {
  it('prefers a bearer token over the browser access cookie', async () => {
    const { guard, getUser } = createGuard();
    const request = {
      method: 'GET',
      headers: {
        authorization: 'Bearer bearer-token',
        cookie: 'tb_admin_access=cookie-token',
      },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(getUser).toHaveBeenCalledWith('bearer-token');
    expect(request).toMatchObject({ accessToken: 'bearer-token' });
  });

  it('uses the browser access cookie when no bearer token is present', async () => {
    const { guard, getUser } = createGuard();
    const request = {
      method: 'GET',
      headers: { cookie: 'tb_admin_access=cookie-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(getUser).toHaveBeenCalledWith('cookie-token');
  });

  it('accepts matching CSRF values for an unsafe cookie-authenticated request', async () => {
    const { guard } = createGuard();
    const request = {
      method: 'POST',
      headers: {
        cookie: 'tb_admin_access=cookie-token; tb_admin_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
      },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('rejects a mismatched CSRF value for an unsafe cookie-authenticated request', async () => {
    const { guard } = createGuard();
    const request = {
      method: 'POST',
      headers: {
        cookie: 'tb_admin_access=cookie-token; tb_admin_csrf=csrf-cookie',
        'x-csrf-token': 'csrf-header',
      },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
