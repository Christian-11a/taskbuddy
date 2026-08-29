import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CronSecretGuard, CRON_SECRET_HEADER } from './cron-secret.guard';

function contextFor(headers: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as never;
}

describe('CronSecretGuard', () => {
  const original = process.env.CRON_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it('accepts a request carrying the configured secret', () => {
    process.env.CRON_SECRET = 'a-real-secret';
    const guard = new CronSecretGuard();
    expect(
      guard.canActivate(contextFor({ [CRON_SECRET_HEADER]: 'a-real-secret' })),
    ).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    process.env.CRON_SECRET = 'a-real-secret';
    const guard = new CronSecretGuard();
    expect(() =>
      guard.canActivate(contextFor({ [CRON_SECRET_HEADER]: 'a-fake-secret' })),
    ).toThrow(UnauthorizedException);
  });

  // The length check exists because timingSafeEqual throws rather than
  // returning false when the buffers differ in size.
  it('rejects a secret of a different length without throwing a crypto error', () => {
    process.env.CRON_SECRET = 'a-real-secret';
    const guard = new CronSecretGuard();
    expect(() =>
      guard.canActivate(contextFor({ [CRON_SECRET_HEADER]: 'short' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a request with no secret at all', () => {
    process.env.CRON_SECRET = 'a-real-secret';
    const guard = new CronSecretGuard();
    expect(() => guard.canActivate(contextFor({}))).toThrow(
      UnauthorizedException,
    );
  });

  // The one that matters: an unset env var must close the endpoint, not open
  // it. These handlers move job status and send push notifications.
  it('refuses with 503 when CRON_SECRET is unset, even with a header present', () => {
    delete process.env.CRON_SECRET;
    const guard = new CronSecretGuard();
    expect(() =>
      guard.canActivate(contextFor({ [CRON_SECRET_HEADER]: 'anything' })),
    ).toThrow(ServiceUnavailableException);
  });
});
