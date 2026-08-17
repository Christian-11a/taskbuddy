import { randomBytes, timingSafeEqual } from 'crypto';
import type { Response } from 'express';

export const ADMIN_ACCESS_COOKIE = 'tb_admin_access';
export const ADMIN_REFRESH_COOKIE = 'tb_admin_refresh';
export const ADMIN_CSRF_COOKIE = 'tb_admin_csrf';

type CookieResponse = Pick<Response, 'cookie' | 'clearCookie'>;

function cookieOptions(httpOnly: boolean) {
  const development = process.env.NODE_ENV === 'development';
  return {
    httpOnly,
    sameSite: development ? ('lax' as const) : ('none' as const),
    secure: !development,
    path: '/',
  };
}

export function setAdminSessionCookies(
  response: Pick<CookieResponse, 'cookie'>,
  session: { access_token: string; refresh_token: string },
) {
  const csrfToken = randomBytes(32).toString('base64url');
  response.cookie(
    ADMIN_ACCESS_COOKIE,
    session.access_token,
    cookieOptions(true),
  );
  response.cookie(
    ADMIN_REFRESH_COOKIE,
    session.refresh_token,
    cookieOptions(true),
  );
  response.cookie(ADMIN_CSRF_COOKIE, csrfToken, cookieOptions(false));
  return csrfToken;
}

export function clearAdminSessionCookies(
  response: Pick<CookieResponse, 'clearCookie'>,
) {
  response.clearCookie(ADMIN_ACCESS_COOKIE, cookieOptions(true));
  response.clearCookie(ADMIN_REFRESH_COOKIE, cookieOptions(true));
  response.clearCookie(ADMIN_CSRF_COOKIE, cookieOptions(false));
}

export function getCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim().split('='))
    .find(([key]) => key === name)
    ?.slice(1)
    .join('=');
}

export function hasMatchingCsrfToken(
  cookieHeader: string | undefined,
  csrfHeader: string | undefined,
) {
  const csrfCookie = getCookie(cookieHeader, ADMIN_CSRF_COOKIE);
  if (!csrfCookie || !csrfHeader) return false;

  const cookieValue = Buffer.from(csrfCookie);
  const headerValue = Buffer.from(csrfHeader);
  return (
    cookieValue.length === headerValue.length &&
    timingSafeEqual(cookieValue, headerValue)
  );
}
