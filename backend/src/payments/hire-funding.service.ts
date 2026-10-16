import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from './stripe.service';
import { StripeCustomersService } from './stripe-customers.service';
import { PaymongoService, type PaymongoPaidSession } from './paymongo.service';
import { ApplicationsService } from '../applications/applications.service';
import { EscrowService } from '../escrow/escrow.service';
import { isMoneyRefusal, peso } from '../escrow/escrow-errors';
import { isAllowedAppRedirect } from '../auth/google-redirect';
import {
  CreateHireCheckoutDto,
  MAX_TOPUP_PHP,
  MIN_TOPUP_PHP,
} from './dto/payments.dto';
import type { Profile } from '../common/types';

/** Marks the PaymentIntents this service is responsible for, on the Stripe side. */
export const HIRE_FUNDING_PURPOSE = 'hire_funding';

/** Marks a payment of the difference for an agreed price increase (0057). */
export const PRICE_CHANGE_PURPOSE = 'price_change';

const CURRENCY = 'php';

/** How PayMongo's payment source types read in messages. */
const METHOD_LABELS: Record<string, string> = {
  gcash: 'GCash',
  paymaya: 'Maya',
  card: 'card',
  dob: 'online banking',
  grab_pay: 'GrabPay',
};

/** Stripe's minimum lifetime for a Checkout Session. */
const CHECKOUT_TTL_SECONDS = 30 * 60;

interface HireApplication {
  id: string;
  job_id: string;
  provider_id: string;
  status: string;
  jobs: {
    id: string;
    title: string;
    status: string;
    client_id: string;
    budget: number | string | null;
  } | null;
}

/**
 * Card-at-hire: a homeowner pays a hire by card instead of from their wallet
 * (BACKEND_SCHEMA.md §29.4, handoff item 6, Story 1 of the Stripe Connect
 * handoff).
 *
 * The request only opens Stripe Checkout. **The webhook does the hire**:
 * `payment_intent.succeeded` credits the payment to the client's wallet as a
 * top-up, places the escrow hold with that payment recorded on it — which is
 * the "HELD immediately after webhook capture" the story asks for — and
 * accepts the application. Same rule as every other top-up (§21): a client
 * that reported its own success could hire people with money that never
 * arrived.
 *
 * The payment is captured immediately rather than authorised and captured
 * later. Card authorisations lapse after about a week and jobs are booked
 * further out than that; a captured charge sitting in the platform's balance
 * is what "separate charges and transfers" means, and it is also what the
 * provider's payout transfer is later sourced from (§29.5).
 *
 * Crediting the wallet first, rather than holding straight from the card, is
 * what keeps `wallet_transactions` the single account of record: every peso
 * held in escrow was debited from a wallet, whichever way it got there. It is
 * also what makes every failure recoverable — if the hire cannot happen by
 * the time the money arrives, the money is simply in the client's wallet.
 */
@Injectable()
export class HireFundingService {
  private readonly logger = new Logger(HireFundingService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly customers: StripeCustomersService,
    private readonly applications: ApplicationsService,
    private readonly escrow: EscrowService,
    private readonly paymongo: PaymongoService,
  ) {}

  /**
   * Opens a Checkout Session for the full job budget.
   *
   * Everything the webhook will need rides on the PaymentIntent's metadata
   * (Session metadata does not propagate to it). The same hireability checks
   * `accept` makes run here first, so a client is never asked for a card to
   * hire someone who could not be hired — the webhook runs them again, since
   * the world can change while they type.
   */
  async createCheckout(
    user: Profile,
    dto: CreateHireCheckoutDto,
    returnBase: string,
  ) {
    if (!isAllowedAppRedirect(dto.app_redirect)) {
      throw new BadRequestException('app_redirect is not an allowed URI');
    }

    const application = await this.load(dto.application_id);
    if (!application?.jobs)
      throw new NotFoundException('Application not found');
    const job = application.jobs;
    if (job.client_id !== user.id) throw new ForbiddenException('Not your job');
    await this.applications.assertHireable({ ...application, jobs: job });

    if (job.budget == null) {
      throw new BadRequestException(
        'This job has no price to pay — hire the provider without payment instead',
      );
    }
    const budget = Number(job.budget);
    if (budget < MIN_TOPUP_PHP || budget > MAX_TOPUP_PHP) {
      throw new BadRequestException({
        message: `Card payments must be between ${peso(MIN_TOPUP_PHP)} and ${peso(MAX_TOPUP_PHP)}`,
        code: 'card_amount_out_of_range',
      });
    }

    const returnUrl = (status: 'success' | 'cancelled') =>
      `${returnBase}/payments/return?flow=hire&status=${status}` +
      `&app_redirect=${encodeURIComponent(dto.app_redirect)}`;

    const metadata = {
      purpose: HIRE_FUNDING_PURPOSE,
      profile_id: user.id,
      application_id: application.id,
      job_id: job.id,
      provider_id: application.provider_id,
    };

    // PayMongo (test mode) when configured: GCash, Maya, card and online
    // banking, with no wallet in between (migration 0056).
    if (this.paymongo.configured) {
      const checkout = await this.paymongo.createCheckout({
        amountCentavos: Math.round(budget * 100),
        name: `Hire — ${job.title}`.slice(0, 120),
        description: `TaskBuddy hire — ${job.title}`.slice(0, 255),
        reference: application.id,
        successUrl: returnUrl('success'),
        cancelUrl: returnUrl('cancelled'),
        metadata,
      });
      return { url: checkout.url, session_id: checkout.id, amount: budget };
    }

    const session = await this.stripeService.stripe.checkout.sessions.create({
      mode: 'payment',
      customer: await this.customers.customerFor(user),
      // A card, specifically: the charge captures synchronously, and it is
      // what the provider's payout transfer is sourced from later.
      payment_method_types: ['card'],
      client_reference_id: application.id,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: Math.round(budget * 100),
            product_data: { name: `Hire — ${job.title}` },
          },
        },
      ],
      payment_intent_data: {
        description: `TaskBuddy hire — ${job.title}`,
        metadata: {
          purpose: HIRE_FUNDING_PURPOSE,
          profile_id: user.id,
          application_id: application.id,
          job_id: job.id,
          provider_id: application.provider_id,
        },
        // Groups the charge with the payout transfer it funds (§29.5).
        transfer_group: `job:${job.id}`,
      },
      success_url: returnUrl('success'),
      cancel_url: returnUrl('cancelled'),
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a Checkout URL');
    }
    return { url: session.url, session_id: session.id, amount: budget };
  }

  /**
   * `payment_intent.succeeded` for a hire. Safe to run any number of times
   * for the same intent, and in any interleaving with a wallet accept:
   *
   * 1. Credit the payment as a top-up. A unique-key collision means an
   *    earlier delivery already did, and processing **continues** — that
   *    delivery may have crashed before finishing the hire.
   * 2. If this payment's hold exists and the application is accepted, a
   *    previous delivery finished. Stop.
   * 3. Refusals — the hire can no longer happen. Answered normally (2xx, so
   *    Stripe stops retrying), the money stays in the wallet, and the client
   *    is told once.
   * 4. Hold, recording this payment and its charge on the escrow row.
   * 5. Accept. On failure, re-read: accepted means someone else finished the
   *    hire; still pending means a fault, so throw and let Stripe retry;
   *    decided means a refusal, and the hold this payment placed is undone.
   *
   * Only faults throw. A refusal that threw would be retried by Stripe for
   * three days; a fault swallowed as a refusal would drop a paid hire on a
   * database blip.
   */
  async completeFromIntent(intent: Stripe.PaymentIntent): Promise<void> {
    const chargeId =
      typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : (intent.latest_charge?.id ?? null);
    if (!chargeId) {
      // Not expected for a succeeded card payment. Without a charge the
      // payout cannot be sent on to Stripe, so the hold is recorded as
      // wallet-funded, which is the safe way to be wrong.
      this.logger.error(`Hire PaymentIntent ${intent.id} has no charge`);
    }
    await this.completeHire({
      ref: intent.id,
      amountCentavos: intent.amount_received,
      currency: intent.currency,
      metadata: intent.metadata ?? {},
      funding: chargeId ? { paymentIntentId: intent.id, chargeId } : undefined,
      methodLabel: 'card',
    });
  }

  /**
   * Checkout for the difference on an agreed price increase (migration 0057).
   * Only the client pays it, and only while the request is
   * `awaiting_payment`. The webhook applies it; nothing changes here.
   */
  async createPriceChangeCheckout(
    user: Profile,
    requestId: string,
    appRedirect: string,
    returnBase: string,
  ) {
    if (!isAllowedAppRedirect(appRedirect)) {
      throw new BadRequestException('app_redirect is not an allowed URI');
    }
    if (!this.paymongo.configured) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const { data, error } = await this.supabase.admin
      .from('job_change_requests')
      .select('id, status, new_budget, job_id, jobs(id, title, client_id)')
      .eq('id', requestId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    const request = data as {
      id: string;
      status: string;
      new_budget: number | string;
      job_id: string;
      jobs: { id: string; title: string; client_id: string } | null;
    } | null;
    if (!request?.jobs) throw new NotFoundException('Change request not found');
    if (request.jobs.client_id !== user.id)
      throw new ForbiddenException('Only the client pays a price change');
    if (request.status !== 'awaiting_payment')
      throw new BadRequestException(
        'This price change is not waiting for payment',
      );
    const escrow = await this.escrow.findByJob(request.job_id);
    const difference =
      Math.round(
        (Number(request.new_budget) - Number(escrow?.amount ?? 0)) * 100,
      ) / 100;
    if (!escrow || escrow.status !== 'held' || difference <= 0)
      throw new BadRequestException('There is no difference to pay');

    const returnUrl = (status: 'success' | 'cancelled') =>
      `${returnBase}/payments/return?flow=hire&status=${status}` +
      `&app_redirect=${encodeURIComponent(appRedirect)}`;
    const checkout = await this.paymongo.createCheckout({
      amountCentavos: Math.round(difference * 100),
      name: `Price change — ${request.jobs.title}`.slice(0, 120),
      description: `TaskBuddy price change — ${request.jobs.title}`.slice(
        0,
        255,
      ),
      reference: request.id,
      successUrl: returnUrl('success'),
      cancelUrl: returnUrl('cancelled'),
      metadata: {
        purpose: PRICE_CHANGE_PURPOSE,
        profile_id: user.id,
        job_id: request.job_id,
        change_request_id: request.id,
      },
    });
    return { url: checkout.url, session_id: checkout.id, amount: difference };
  }

  /** `checkout_session.payment.paid` from PayMongo (test mode). */
  async completeFromPaymongo(paid: PaymongoPaidSession): Promise<void> {
    if (paid.metadata.purpose === PRICE_CHANGE_PURPOSE) {
      return this.completePriceChange(paid);
    }
    if (paid.metadata.purpose !== HIRE_FUNDING_PURPOSE) return;
    await this.completeHire({
      ref: paid.paymentId,
      amountCentavos: paid.amountCentavos,
      currency: paid.currency,
      metadata: paid.metadata,
      // Held without Stripe funding: the payout is passed through to the
      // provider's linked account instead of a Connect transfer.
      funding: undefined,
      methodLabel: METHOD_LABELS[paid.method] ?? 'online payment',
    });
  }

  private async completeHire(payment: {
    ref: string;
    amountCentavos: number;
    currency: string;
    metadata: Record<string, string>;
    funding: { paymentIntentId: string; chargeId: string } | undefined;
    methodLabel: string;
  }): Promise<void> {
    const { profile_id, application_id, job_id, provider_id } =
      payment.metadata;
    if (!profile_id || !application_id || !job_id || !provider_id) {
      this.logger.error(
        `Hire payment ${payment.ref} is missing metadata — cannot act on it`,
      );
      return;
    }

    const application = await this.load(application_id);
    const job = application?.jobs ?? null;
    const amount = payment.amountCentavos / 100;

    const fresh = await this.credit(
      payment.ref,
      profile_id,
      amount,
      job_id,
      job?.title,
      payment.methodLabel,
    );

    // A payment that cannot become a hire goes straight back to where it
    // came from: there is no wallet to leave it in (migration 0056).
    const refuse = async (reason: string) => {
      this.logger.warn(
        `Hire payment ${payment.ref} not turned into a hire: ${reason}`,
      );
      await this.escrow.passThrough([profile_id]);
      if (fresh) {
        await this.notify(
          profile_id,
          'payment_update',
          'Payment refunded',
          `Your ${payment.methodLabel} payment of ${peso(amount)} could not complete the hire: ${reason}. It has been refunded to your payment method.`,
          job_id,
        );
      }
    };

    const existing = await this.escrow.findByJob(job_id);
    if (
      existing?.status === 'held' &&
      existing.provider_id === provider_id &&
      application?.status === 'accepted'
    ) {
      return;
    }

    // ── 3. Refusals ────────────────────────────────────────────────────────
    if (!application || !job) return refuse('the proposal no longer exists');
    if (
      application.job_id !== job_id ||
      application.provider_id !== provider_id ||
      job.client_id !== profile_id
    ) {
      return refuse('the payment does not match this proposal');
    }
    if (application.status === 'accepted') {
      return refuse('this job was already hired');
    }
    if (application.status !== 'pending') {
      return refuse(`the proposal was ${application.status}`);
    }
    if (!['open', 'recommending'].includes(job.status)) {
      return refuse('the job is no longer open');
    }
    if (
      payment.currency !== CURRENCY ||
      job.budget == null ||
      payment.amountCentavos !== Math.round(Number(job.budget) * 100)
    ) {
      return refuse('the amount paid does not match the job budget');
    }
    if (!(await this.providerIsVerified(provider_id))) {
      return refuse('the provider is no longer verified');
    }

    // ── 4. Hold ────────────────────────────────────────────────────────────
    try {
      await this.escrow.hold(job_id, provider_id, payment.funding);
    } catch (err) {
      if (isMoneyRefusal(err)) return refuse((err as Error).message);
      throw err;
    }

    // ── 5. Accept ──────────────────────────────────────────────────────────
    try {
      await this.applications.acceptFunded({ ...application, jobs: job });
    } catch (err) {
      const now = await this.applications.statusOf(application_id);
      if (now === 'accepted') return;
      if (now === 'pending' || now === 'unknown') throw err;
      const held = await this.escrow.findByJob(job_id);
      if (held?.status === 'held' && held.provider_id === provider_id) {
        await this.escrow.releaseHoldForFailedHire(job_id);
      }
      return refuse(`the proposal was ${now}`);
    }

    // ── 6. Tell both sides ─────────────────────────────────────────────────
    await this.notify(
      profile_id,
      'payment_update',
      'Hire confirmed',
      `You paid ${peso(amount)} by ${payment.methodLabel} for "${job.title}". It is held in escrow until you confirm the job is done.`,
      job_id,
    );
    this.logger.log(
      `Hired ${provider_id} for job ${job_id} on ${payment.methodLabel} payment ${payment.ref}`,
    );
  }

  /**
   * The difference for a price increase arrived. Credited first (idempotent
   * on the payment id), then held and applied by job_change_apply_payment. If
   * the request can no longer take it, the payment is refunded instead.
   */
  private async completePriceChange(paid: PaymongoPaidSession): Promise<void> {
    const { profile_id, job_id, change_request_id } = paid.metadata;
    if (!profile_id || !job_id || !change_request_id) {
      this.logger.error(
        `Price change payment ${paid.paymentId} is missing metadata`,
      );
      return;
    }
    const amount = paid.amountCentavos / 100;
    const method = METHOD_LABELS[paid.method] ?? 'online payment';
    const fresh = await this.credit(
      paid.paymentId,
      profile_id,
      amount,
      job_id,
      'price change',
      method,
    );
    const { error } = await this.supabase.admin.rpc(
      'job_change_apply_payment',
      {
        p_request_id: change_request_id,
        p_amount: amount,
      },
    );
    if (!error) return;
    if (error.code !== 'TB409' && error.code !== 'TB404') {
      // A fault, not a refusal: fail the webhook so PayMongo retries.
      throw new Error(`Could not apply price change: ${error.message}`);
    }
    this.logger.warn(
      `Price change payment ${paid.paymentId} not applied: ${error.message}`,
    );
    await this.escrow.passThrough([profile_id]);
    if (fresh) {
      await this.notify(
        profile_id,
        'payment_update',
        'Payment refunded',
        `Your ${method} payment of ${peso(amount)} could not be applied: ${error.message}. It has been refunded to your payment method.`,
        job_id,
      );
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * The application, its job and the budget. A read error is thrown as a
   * plain Error rather than an HTTP exception on purpose: in the webhook that
   * becomes a 500 and Stripe retries, where a 4xx would read as a refusal.
   */
  private async load(applicationId: string): Promise<HireApplication | null> {
    const { data, error } = await this.supabase.admin
      .from('job_applications')
      .select(
        'id, job_id, provider_id, status, jobs(id, title, status, client_id, budget)',
      )
      .eq('id', applicationId)
      .maybeSingle();
    if (error) throw new Error(`Could not read application: ${error.message}`);
    return (data as HireApplication | null) ?? null;
  }

  private async providerIsVerified(providerId: string): Promise<boolean> {
    const { data, error } = await this.supabase.admin
      .from('provider_profiles')
      .select('is_verified')
      .eq('profile_id', providerId)
      .maybeSingle();
    if (error) throw new Error(`Could not read provider: ${error.message}`);
    return data?.is_verified === true;
  }

  /**
   * Writes the top-up this payment earns. Returns false when an earlier
   * delivery already did — uq_wallet_txn_stripe_pi is the idempotency check,
   * exactly as for ordinary top-ups (§21).
   */
  private async credit(
    ref: string,
    profileId: string,
    amount: number,
    jobId: string,
    jobTitle: string | undefined,
    methodLabel: string,
  ): Promise<boolean> {
    const { error } = await this.supabase.admin
      .from('wallet_transactions')
      .insert({
        profile_id: profileId,
        direction: 'credit',
        kind: 'topup',
        amount,
        title: `Payment (${methodLabel}) — ${jobTitle ?? 'hire'}`.slice(0, 120),
        status: 'completed',
        // Unique: the idempotency key for Stripe and PayMongo payment ids alike.
        stripe_payment_intent_id: ref,
        job_id: jobId,
      });
    if (error?.code === '23505') return false;
    // Money reached us; the ledger row is not optional. Non-2xx → retry.
    if (error) throw new Error(`Could not credit ${ref}: ${error.message}`);
    return true;
  }

  /** Best-effort, like every notify in this codebase. */
  private async notify(
    recipientId: string,
    type: string,
    title: string,
    body: string,
    jobId: string,
  ) {
    const { error } = await this.supabase.admin.from('notifications').insert({
      recipient_id: recipientId,
      type,
      title,
      body,
      data: { job_id: jobId },
    });
    if (error) this.logger.warn(`Notification not written: ${error.message}`);
  }
}
