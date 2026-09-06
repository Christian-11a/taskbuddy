import { Throttle } from '@nestjs/throttler';

/**
 * Named rate limits, so a route says *why* it is limited rather than carrying
 * an inline pair of numbers nobody can compare against its neighbours.
 *
 * Each of these overrides the global `default` throttler for one route (see
 * `ThrottlerModule.forRoot` in app.module.ts). They are deliberately not
 * *additional* named throttlers: a second entry in `forRoot` applies to every
 * route in the API, so a 5-per-minute payment limit declared there would also
 * be a 5-per-minute limit on reading a job list.
 *
 * **Every limit is per endpoint, per client IP, and held in memory.** That is
 * the throttler's own key — `sha256(Class-handler-throttlerName-ip)` — not a
 * choice made here, and it is what makes the ceiling honest: exhausting
 * `POST /auth/login` leaves `POST /auth/forgot-password` untouched, and there
 * is no aggregate cap across the API at all. This is abuse damping in front of
 * Stripe and Supabase Auth on the specific routes that need it, not a quota
 * system. See BACKEND_SCHEMA.md §28.4.
 */

/**
 * Anything that opens a payment. Five a minute *for that route* is far above
 * real use — a person tops up once, and the app opens one Checkout session per
 * tap — and far below what it takes to use TaskBuddy as a free card-testing
 * endpoint against Stripe. Both payment routes carry it, so neither is a way
 * around the other.
 */
export const ThrottlePayments = () =>
  Throttle({ default: { limit: 5, ttl: 60_000 } });

/**
 * Credential endpoints: login, register, password reset, signup OTP. The limit
 * answers two different attacks at once — guessing one account's password, and
 * using someone else's address as a mail relay by requesting codes they never
 * asked for. Ten a minute leaves room for a person mistyping their password a
 * few times.
 *
 * Ten *per route*, not ten across all of them: an attacker spreading across
 * login, register and the two OTP routes gets ten each. That is the honest
 * shape of a per-handler limiter, and it is still the difference between a
 * password guess costing ten attempts a minute and costing thousands.
 */
export const ThrottleAuth = () =>
  Throttle({ default: { limit: 10, ttl: 60_000 } });
