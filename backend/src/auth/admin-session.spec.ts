import {
  clearAdminSessionCookies,
  setAdminSessionCookies,
} from './admin-session';

describe('admin session cookies', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('sets cross-site secure auth cookies and a readable CSRF cookie in production', () => {
    process.env.NODE_ENV = 'production';
    const response = { cookie: jest.fn() };

    setAdminSessionCookies(response, {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'tb_admin_access',
      'access-token',
      { httpOnly: true, sameSite: 'none', secure: true, path: '/' },
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'tb_admin_refresh',
      'refresh-token',
      { httpOnly: true, sameSite: 'none', secure: true, path: '/' },
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      3,
      'tb_admin_csrf',
      expect.any(String),
      { httpOnly: false, sameSite: 'none', secure: true, path: '/' },
    );
  });

  it('uses localhost-compatible cookies in development', () => {
    process.env.NODE_ENV = 'development';
    const response = { cookie: jest.fn() };

    setAdminSessionCookies(response, {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });

    expect(response.cookie).toHaveBeenCalledWith(
      'tb_admin_access',
      'access-token',
      { httpOnly: true, sameSite: 'lax', secure: false, path: '/' },
    );
  });

  it('clears every browser-admin cookie', () => {
    const response = { clearCookie: jest.fn() };

    clearAdminSessionCookies(response);

    expect(response.clearCookie).toHaveBeenCalledWith(
      'tb_admin_access',
      expect.objectContaining({ httpOnly: true, sameSite: 'none', path: '/' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'tb_admin_refresh',
      expect.objectContaining({ httpOnly: true, sameSite: 'none', path: '/' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'tb_admin_csrf',
      expect.objectContaining({ httpOnly: false, sameSite: 'none', path: '/' }),
    );
  });
});
