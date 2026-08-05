import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';

const STRIPE_ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

/**
 * Holds the Stripe client and the answer to "is Stripe configured here?".
 *
 * Follows the pattern AuthService established for Google: warn at boot, fail
 * with a 503 at the point of use. A developer running the API to work on jobs
 * or chat has no reason to hold Stripe keys, and refusing to boot without them
 * would make that impossible.
 */
@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  onModuleInit() {
    const missing = STRIPE_ENV_KEYS.filter((key) => !process.env[key]);
    if (missing.length) {
      this.logger.warn(
        `Stripe is disabled — missing env: ${missing.join(', ')}. ` +
          'See docs/stripe-setup.md.',
      );
    }
  }

  get publishableKey(): string {
    return process.env.STRIPE_PUBLISHABLE_KEY ?? '';
  }

  get webhookSecret(): string {
    return this.requireEnv('STRIPE_WEBHOOK_SECRET');
  }

  /** The Stripe client, created on first use. */
  get stripe(): Stripe {
    if (!this.client) {
      this.client = new Stripe(this.requireEnv('STRIPE_SECRET_KEY'));
    }
    return this.client;
  }

  private requireEnv(key: (typeof STRIPE_ENV_KEYS)[number]): string {
    const missing = STRIPE_ENV_KEYS.filter((k) => !process.env[k]);
    if (missing.length) {
      this.logger.error(`Stripe used without config: ${missing.join(', ')}`);
      throw new ServiceUnavailableException(
        'Payments are not configured on this server',
      );
    }
    return process.env[key]!;
  }
}
