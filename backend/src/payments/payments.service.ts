import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { VerificationsService } from '../verifications/verifications.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutSessionDto, CreateTopupDto } from './dto/payments.dto';
import { isAllowedAppRedirect } from '../auth/google-redirect';
import type { Profile } from '../common/types';

const CURRENCY = 'php';

/**
 * API version handed to the mobile SDK with its ephemeral key. It pins the
 * shape of the Customer object the SDK reads and is deliberately separate from
 * the version this server's own calls use — the two upgrade independently.
 * Override when @stripe/stripe-react-native is upgraded to require a newer one.
 */
const MOBILE_API_VERSION =
  process.env.STRIPE_MOBILE_API_VERSION ?? '2025-01-27';

/** Marks the PaymentIntents this service is responsible for, on the Stripe side. */
const TOPUP_PURPOSE = 'wallet_topup';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly verifications: VerificationsService,
  ) {}

  /**
   * Everything PaymentSheet needs to collect a card for a wallet top-up.
   *
   * Note what this does NOT do: credit the wallet. A PaymentIntent here only
   * means the user opened the sheet. The ledger moves in the webhook, on
   * Stripe's word that the charge settled — a client that reported its own
   * success could mint balance, and balance buys labour through escrow (§18).
   */
  async createTopupIntent(user: Profile, dto: CreateTopupDto) {
    const stripe = this.stripeService.stripe;
    const customerId = await this.customerFor(user);

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: MOBILE_API_VERSION },
    );

    const intent = await stripe.paymentIntents.create({
      // Stripe counts in the currency's smallest unit; PHP has two decimals.
      // Rounding rather than truncating keeps ₱10.005 from becoming ₱10.00.
      amount: Math.round(dto.amount * 100),
      currency: CURRENCY,
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      // The webhook has only the event to work from — no session, no bearer
      // token — so the identity of the payer has to travel with the intent.
      metadata: {
        profile_id: user.id,
        purpose: TOPUP_PURPOSE,
      },
    });

    return {
      payment_intent_client_secret: intent.client_secret,
      ephemeral_key_secret: ephemeralKey.secret,
      customer_id: customerId,
      publishable_key: this.stripeService.publishableKey,
      amount: dto.amount,
      currency: CURRENCY,
    };
  }

  /**
   * A wallet top-up run through Stripe's hosted Checkout page.
   *
   * This exists because PaymentSheet is a native module and the app runs in
   * Expo Go, which cannot load one. Checkout needs nothing but a browser, so
   * the same flow works in Expo Go, a dev build and the web.
   *
   * The wallet is credited by the webhook, exactly as in `createTopupIntent` —
   * the return redirect only decides which screen the user lands on. A user who
   * closes the browser after paying still gets their money.
   *
   * @param returnBase Public origin of this API, used to build the URLs Stripe
   *   sends the browser back to. Stripe rejects anything that isn't http(s),
   *   which is why the deep link can't be handed to it directly.
   */
  async createCheckoutSession(
    user: Profile,
    dto: CreateCheckoutSessionDto,
    returnBase: string,
  ) {
    // Checked here rather than in a DTO validator because rejecting it is a
    // security decision, not a formatting one: /payments/return will redirect
    // a browser to whatever comes back out of the session, so an unvetted
    // value makes this endpoint an open redirect.
    if (!isAllowedAppRedirect(dto.app_redirect)) {
      throw new BadRequestException('app_redirect is not an allowed URI');
    }

    const stripe = this.stripeService.stripe;
    const customerId = await this.customerFor(user);
    const returnUrl = (status: 'success' | 'cancelled') =>
      `${returnBase}/payments/return?status=${status}` +
      `&app_redirect=${encodeURIComponent(dto.app_redirect)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            // Smallest unit, same rounding rule as createTopupIntent.
            unit_amount: Math.round(dto.amount * 100),
            product_data: { name: 'TaskBuddy wallet top-up' },
          },
        },
      ],
      // The metadata goes on the PaymentIntent, not the Session. Session
      // metadata does not propagate, and it is the PaymentIntent that the
      // `payment_intent.succeeded` handler reads — putting it here means
      // Checkout credits the wallet through the exact same code path as
      // PaymentSheet, with no second handler and no new webhook subscription.
      payment_intent_data: {
        metadata: { profile_id: user.id, purpose: TOPUP_PURPOSE },
      },
      success_url: returnUrl('success'),
      cancel_url: returnUrl('cancelled'),
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a Checkout URL');
    }
    return { url: session.url, session_id: session.id, amount: dto.amount };
  }

  /**
   * Verifies the webhook signature and returns the parsed event.
   *
   * The signature is the only thing separating this endpoint from an
   * unauthenticated "credit my wallet" API — it must be checked against the
   * exact bytes Stripe signed, which is why the route takes a raw body rather
   * than a parsed one.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripeService.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.stripeService.webhookSecret,
      );
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Applies an event exactly once.
   *
   * Ordering matters. The event is recorded *after* the work, not before: a
   * crash in between then means Stripe retries and we redo the work, which is
   * safe (the ledger insert collides on uq_wallet_txn_stripe_pi, and the
   * Identity updates are assignments). Recording first would make the opposite
   * failure — work never done, event marked handled — permanent and silent.
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    if (await this.alreadyProcessed(event.id)) return;

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.creditWallet(event.data.object);
        break;
      case 'identity.verification_session.verified':
        await this.verifications.applyIdentityResult(
          event.data.object.id,
          'verified',
        );
        break;
      // `requires_input` is Stripe's terminal-for-now failure: the check did
      // not pass and the provider must resubmit. Treated as a rejection so the
      // status screen stops saying "under review".
      case 'identity.verification_session.requires_input':
        await this.verifications.applyIdentityResult(
          event.data.object.id,
          'rejected',
          event.data.object.last_error?.reason ??
            'We could not verify your ID. Please try again.',
        );
        break;
      default:
        // Unhandled types are still recorded, so an endpoint subscribed to more
        // than we handle does not re-deliver them forever.
        this.logger.debug(`Ignoring Stripe event type ${event.type}`);
    }

    await this.recordProcessed(event);
  }

  async alreadyProcessed(eventId: string): Promise<boolean> {
    const { data } = await this.supabase.admin
      .from('stripe_events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle();
    return data !== null;
  }

  async recordProcessed(event: Stripe.Event): Promise<void> {
    await this.supabase.admin
      .from('stripe_events')
      .upsert({ id: event.id, type: event.type }, { onConflict: 'id' });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Writes the ledger row a settled top-up earns.
   *
   * `kind` is 'topup', set here and never taken from anything the payer
   * controls — the same rule §18 states for the rest of the ledger, since a
   * row tagged 'payout' would register as platform revenue.
   */
  private async creditWallet(intent: Stripe.PaymentIntent): Promise<void> {
    if (intent.metadata?.purpose !== TOPUP_PURPOSE) return;

    const profileId = intent.metadata?.profile_id;
    if (!profileId) {
      this.logger.error(
        `PaymentIntent ${intent.id} has no profile_id metadata — cannot credit`,
      );
      return;
    }

    const amount = intent.amount_received / 100;
    const { error } = await this.supabase.admin
      .from('wallet_transactions')
      .insert({
        profile_id: profileId,
        direction: 'credit',
        kind: 'topup',
        amount,
        title: 'Wallet top-up',
        status: 'completed',
        stripe_payment_intent_id: intent.id,
      });

    // uq_wallet_txn_stripe_pi — a redelivered event for an intent already
    // credited. This is the expected outcome of a Stripe retry, not a fault.
    if (error?.code === '23505') {
      this.logger.log(`PaymentIntent ${intent.id} was already credited`);
      return;
    }
    if (error) {
      // Thrown, not swallowed: the caller turns this into a non-2xx so Stripe
      // retries. Money reached us — the ledger row is not optional.
      throw new BadRequestException(error.message);
    }

    await this.supabase.admin.from('notifications').insert({
      recipient_id: profileId,
      type: 'payment_update',
      title: 'Wallet topped up',
      body: `₱${amount.toFixed(2)} has been added to your wallet.`,
      data: { payment_intent_id: intent.id, amount },
    });
    this.logger.log(`Credited ₱${amount} to ${profileId} (${intent.id})`);
  }

  /**
   * The user's Stripe customer, created on first payment.
   *
   * Reusing one customer per profile is what lets PaymentSheet offer a saved
   * card on the second top-up instead of asking for the number again.
   */
  private async customerFor(user: Profile): Promise<string> {
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.stripe_customer_id)
      return profile.stripe_customer_id as string;

    const { data: authData } = await this.supabase.admin.auth.admin.getUserById(
      user.id,
    );

    const customer = await this.stripeService.stripe.customers.create({
      email: authData?.user?.email ?? undefined,
      name: user.full_name,
      metadata: { profile_id: user.id },
    });

    const { error } = await this.supabase.admin
      .from('profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', user.id);
    if (error) throw new BadRequestException(error.message);

    return customer.id;
  }
}
