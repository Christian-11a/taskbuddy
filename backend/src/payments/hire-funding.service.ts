import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from './stripe.service';
import { StripeCustomersService } from './stripe-customers.service';
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

const CURRENCY = 'php';

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
        'This job has no budget to pay — accept it from your wallet instead',
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
    const meta = intent.metadata ?? {};
    const { profile_id, application_id, job_id, provider_id } = meta;
    if (!profile_id || !application_id || !job_id || !provider_id) {
      this.logger.error(
        `Hire PaymentIntent ${intent.id} is missing metadata — cannot act on it`,
      );
      return;
    }

    const application = await this.load(application_id);
    const job = application?.jobs ?? null;
    const amount = intent.amount_received / 100;

    const fresh = await this.credit(intent, profile_id, amount, job?.title);

    const refuse = async (reason: string) => {
      this.logger.warn(
        `Hire PaymentIntent ${intent.id} not turned into a hire: ${reason}`,
      );
      if (fresh) {
        await this.notify(
          profile_id,
          'payment_update',
          'Payment added to your wallet',
          `Your card payment of ${peso(amount)} is in your wallet, but the hire could not be completed: ${reason}. You can use it for another hire or withdraw it.`,
          job_id,
        );
      }
    };

    const existing = await this.escrow.findByJob(job_id);
    if (
      existing?.funding_payment_intent_id === intent.id &&
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
      intent.currency !== CURRENCY ||
      job.budget == null ||
      intent.amount_received !== Math.round(Number(job.budget) * 100)
    ) {
      return refuse('the amount paid does not match the job budget');
    }
    if (!(await this.providerIsVerified(provider_id))) {
      return refuse('the provider is no longer verified');
    }

    // ── 4. Hold ────────────────────────────────────────────────────────────
    const chargeId =
      typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : (intent.latest_charge?.id ?? null);
    if (!chargeId) {
      // Not expected for a succeeded card payment. Without a charge the
      // payout cannot be sent on to Stripe, so the hold is recorded as
      // wallet-funded: the provider's payout then stays in their wallet,
      // which is the safe way to be wrong.
      this.logger.error(`Hire PaymentIntent ${intent.id} has no charge`);
    }
    try {
      await this.escrow.hold(
        job_id,
        provider_id,
        chargeId ? { paymentIntentId: intent.id, chargeId } : undefined,
      );
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
      if (
        held?.status === 'held' &&
        held.funding_payment_intent_id === intent.id
      ) {
        await this.escrow.releaseHoldForFailedHire(job_id);
      }
      return refuse(`the proposal was ${now}`);
    }

    // ── 6. Tell both sides ─────────────────────────────────────────────────
    await this.notify(
      profile_id,
      'payment_update',
      'Hire confirmed',
      `You paid ${peso(amount)} by card for "${job.title}". It is held in escrow until you confirm the job is done.`,
      job_id,
    );
    this.logger.log(
      `Hired ${provider_id} for job ${job_id} on card payment ${intent.id}`,
    );
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
    intent: Stripe.PaymentIntent,
    profileId: string,
    amount: number,
    jobTitle: string | undefined,
  ): Promise<boolean> {
    const { error } = await this.supabase.admin
      .from('wallet_transactions')
      .insert({
        profile_id: profileId,
        direction: 'credit',
        kind: 'topup',
        amount,
        title: `Card payment — ${jobTitle ?? 'hire'}`.slice(0, 120),
        status: 'completed',
        stripe_payment_intent_id: intent.id,
        job_id: intent.metadata?.job_id ?? null,
      });
    if (error?.code === '23505') return false;
    // Money reached us; the ledger row is not optional. Non-2xx → retry.
    if (error)
      throw new Error(`Could not credit ${intent.id}: ${error.message}`);
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
