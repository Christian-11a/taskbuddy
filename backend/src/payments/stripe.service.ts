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
    } else if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
      // Payments work without it; only provider payout accounts go stale,
      // because Stripe's account.updated events have nowhere verified to land.
      this.logger.warn(
        'Stripe Connect webhook is disabled — missing env: ' +
          'STRIPE_CONNECT_WEBHOOK_SECRET. Payout accounts will only update ' +
          'when a provider syncs. See docs/stripe-setup.md §6.',
      );
    }
  }

  /**
   * The signing secret of the *Connect* webhook endpoint — a different
   * endpoint, with a different secret, from the platform one: events about
   * connected accounts (account.updated, capability.updated) are only
   * delivered to an endpoint created with "Events on Connected accounts".
   * Optional, so a deployment that never uses Connect needs nothing new.
   * (Locally, `stripe listen --forward-connect-to` signs both with the one
   * secret it prints; set both variables to it.)
   */
  get connectWebhookSecret(): string {
    this.requireEnv('STRIPE_SECRET_KEY');
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error(
        'Connect webhook used without STRIPE_CONNECT_WEBHOOK_SECRET',
      );
      throw new ServiceUnavailableException(
        'Stripe Connect is not configured on this server',
      );
    }
    return secret;
  }

  /**
   * Country for new Express accounts. Stripe has no Philippine platforms, so
   * a PH provider can only be a cross-border *recipient* account on a
   * platform elsewhere — which this lets a deployment opt into once Stripe
   * has confirmed it for the account (docs/stripe-setup.md §6). Defaults to
   * the US, which every test-mode platform can onboard.
   */
  get connectCountry(): string {
    return (process.env.STRIPE_CONNECT_COUNTRY ?? 'US').toUpperCase();
  }

  /**
   * `recipient` for cross-border accounts (transfers only, no card
   * payments), `full` otherwise. Stripe decides which a country allows.
   */
  get connectServiceAgreement(): 'full' | 'recipient' {
    return process.env.STRIPE_CONNECT_SERVICE_AGREEMENT === 'recipient'
      ? 'recipient'
      : 'full';
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
