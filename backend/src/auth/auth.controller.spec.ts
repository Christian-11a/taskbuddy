import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

const SESSION = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 0,
};

function createAuthService() {
  const login = jest.fn().mockResolvedValue({
    user: {
      id: 'admin-1',
      email: 'admin@example.test',
      full_name: 'Admin User',
      role: 'admin',
    },
    session: SESSION,
  });
  const refresh = jest.fn().mockResolvedValue({ session: SESSION });
  const logout = jest.fn().mockResolvedValue({ success: true });
  const emailFor = jest.fn().mockResolvedValue('admin@example.test');
  return {
    authService: {
      login,
      refresh,
      logout,
      emailFor,
    } as unknown as AuthService,
    login,
    refresh,
    logout,
    emailFor,
  };
}

describe('AuthController browser admin endpoints', () => {
  it('rejects a non-admin login without issuing cookies', async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const authService = {
      login: jest.fn().mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.test', role: 'client' },
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: 0,
        },
      }),
      logout,
    } as unknown as AuthService;
    const controller = new AuthController(authService);
    const response = { cookie: jest.fn() } as never;

    await expect(
      controller.adminLogin(
        { email: 'user@example.test', password: 'password' },
        response,
        { headers: { origin: 'http://localhost:3000' } },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(logout).toHaveBeenCalledWith('access-token');
    expect((response as { cookie: jest.Mock }).cookie).not.toHaveBeenCalled();
  });

  it('issues browser-admin cookies for a successful admin login', async () => {
    process.env.NODE_ENV = 'production';
    const { authService } = createAuthService();
    const controller = new AuthController(authService);
    const response = { cookie: jest.fn() } as never;

    const result = await controller.adminLogin(
      { email: 'admin@example.test', password: 'password' },
      response,
      { headers: { origin: 'https://taskbuddy-nine-zeta.vercel.app' } },
    );
    const csrfToken = (
      response as { cookie: jest.Mock }
    ).cookie.mock.calls.find(([name]) => name === 'tb_admin_csrf')![1];

    expect(result).toEqual({
      user: {
        id: 'admin-1',
        email: 'admin@example.test',
        full_name: 'Admin User',
        role: 'admin',
      },
      csrf_token: csrfToken,
    });
    expect((response as { cookie: jest.Mock }).cookie).toHaveBeenCalledWith(
      'tb_admin_access',
      'access-token',
      expect.objectContaining({ sameSite: 'none', secure: true }),
    );
  });

  it('allows the default local web origin to log in', async () => {
    const { authService, login } = createAuthService();
    const controller = new AuthController(authService);

    await expect(
      controller.adminLogin(
        { email: 'admin@example.test', password: 'password' },
        { cookie: jest.fn() } as never,
        { headers: { origin: 'http://localhost:3000' } },
      ),
    ).resolves.toEqual(expect.objectContaining({ user: expect.any(Object) }));

    expect(login).toHaveBeenCalled();
  });

  it.each([undefined, 'https://evil.example'])(
    'rejects admin login from an untrusted origin',
    async (origin) => {
      const { authService, login } = createAuthService();
      const controller = new AuthController(authService);

      await expect(
        controller.adminLogin(
          { email: 'admin@example.test', password: 'password' },
          { cookie: jest.fn() } as never,
          { headers: { origin } },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(login).not.toHaveBeenCalled();
    },
  );

  it('refreshes browser-admin cookies from the refresh cookie', async () => {
    const { authService, refresh } = createAuthService();
    const controller = new AuthController(authService);
    const response = { cookie: jest.fn() } as never;

    const result = await controller.adminRefresh(
      {
        headers: {
          cookie: 'tb_admin_refresh=refresh-token; tb_admin_csrf=csrf-token',
          'x-csrf-token': 'csrf-token',
        },
      },
      response,
    );
    const csrfToken = (
      response as { cookie: jest.Mock }
    ).cookie.mock.calls.find(([name]) => name === 'tb_admin_csrf')![1];

    expect(result).toEqual({ success: true, csrf_token: csrfToken });

    expect(refresh).toHaveBeenCalledWith({
      refresh_token: 'refresh-token',
    });
    expect((response as { cookie: jest.Mock }).cookie).toHaveBeenCalledWith(
      'tb_admin_refresh',
      'refresh-token',
      expect.any(Object),
    );
  });

  it('returns the admin session identity with its account email', async () => {
    const { authService, emailFor } = createAuthService();
    const controller = new AuthController(authService);

    expect(
      await controller.adminSession(
        { id: 'admin-1', full_name: 'Admin User', role: 'admin' } as never,
        { headers: { cookie: 'tb_admin_csrf=csrf-token' } },
      ),
    ).toEqual({
      user: {
        id: 'admin-1',
        email: 'admin@example.test',
        full_name: 'Admin User',
        role: 'admin',
      },
      csrf_token: 'csrf-token',
    });
    expect(emailFor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1' }),
    );
  });

  it('revokes the current token and clears browser-admin cookies on logout', async () => {
    const { authService, logout } = createAuthService();
    const controller = new AuthController(authService);
    const response = { clearCookie: jest.fn() } as never;

    await expect(
      controller.adminLogout(
        { accessToken: 'access-token' } as never,
        response,
      ),
    ).resolves.toEqual({ success: true });

    expect(logout).toHaveBeenCalledWith('access-token');
    expect(
      (response as { clearCookie: jest.Mock }).clearCookie,
    ).toHaveBeenCalledWith('tb_admin_access', expect.any(Object));
  });

  it('rejects a refresh with a missing or mismatched CSRF token', async () => {
    const { authService, refresh } = createAuthService();
    const controller = new AuthController(authService);

    await expect(
      controller.adminRefresh(
        {
          headers: {
            cookie: 'tb_admin_refresh=refresh-token; tb_admin_csrf=csrf-cookie',
            'x-csrf-token': 'csrf-header',
          },
        },
        { cookie: jest.fn() } as never,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('AuthController Google handoff (0071)', () => {
  function respond() {
    const res = {
      setHeader: jest.fn(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
      redirect: jest.fn(),
    };
    return res;
  }

  it('sends the handoff id and its secret, never tokens, on the deep link', async () => {
    const authService = {
      handleGoogleCallback: jest.fn().mockResolvedValue({
        appRedirect: 'taskbuddy://',
        handoffId: 'handoff-0123456789abcdef',
        handoffSecret: 'secret-value',
        session: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_at: 1,
        },
      }),
    } as unknown as AuthService;
    const res = respond();

    await new AuthController(authService).googleCallback(
      'code',
      'state',
      res as never,
    );

    const page = String(res.send.mock.calls[0][0]);
    expect(page).toContain('handoff=handoff-0123456789abcdef');
    expect(page).toContain('handoff_secret=secret-value');
    expect(page).not.toContain('access');
  });

  it('passes the challenge through to the authorize URL builder', () => {
    const buildGoogleAuthUrl = jest
      .fn()
      .mockReturnValue('https://accounts.test');
    const controller = new AuthController({
      buildGoogleAuthUrl,
    } as unknown as AuthService);

    controller.googleAuthorize('taskbuddy://', 'handoff-id', 'c'.repeat(64));

    expect(buildGoogleAuthUrl).toHaveBeenCalledWith(
      'taskbuddy://',
      'handoff-id',
      'c'.repeat(64),
    );
  });

  it('requires all three parts to claim', async () => {
    const claimGoogleHandoff = jest.fn().mockResolvedValue({ session: {} });
    const controller = new AuthController({
      claimGoogleHandoff,
    } as unknown as AuthService);

    await controller.claimGoogleSession({
      handoff_id: 'handoff-id',
      handoff_secret: 'secret',
      verifier: 'verifier',
    });

    expect(claimGoogleHandoff).toHaveBeenCalledWith(
      'handoff-id',
      'secret',
      'verifier',
    );
  });
});
