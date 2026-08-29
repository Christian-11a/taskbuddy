import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/** Header pg_net sets on every tick (migration 0025, `scheduler_tick`). */
export const CRON_SECRET_HEADER = 'x-taskbuddy-cron-secret';

/**
 * Authenticates the /internal/tick/* endpoints.
 *
 * There is no Supabase user behind a cron tick, so there is nothing for
 * JwtAuthGuard to load a profile from — these are authenticated by a shared
 * secret instead, the one held in the database's Vault and handed to the API
 * as CRON_SECRET.
 *
 * An unset CRON_SECRET is a 503, never a pass. These endpoints run the sweeps
 * that move job status and send push notifications; a missing env var must not
 * be the thing that leaves them open to anyone who can reach the API.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      throw new ServiceUnavailableException(
        'Scheduler ticks are not configured on this instance',
      );
    }

    const request = context.switchToHttp().getRequest();
    const provided: string | undefined = request.headers[CRON_SECRET_HEADER];
    if (!provided || !constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException('Invalid scheduler credentials');
    }
    return true;
  }
}

/**
 * timingSafeEqual throws on a length mismatch rather than returning false, so
 * the lengths are compared first. That leaks the secret's length and nothing
 * else, which is the standard trade for this check.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
