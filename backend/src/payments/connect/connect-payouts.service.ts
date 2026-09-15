import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Stripe from 'stripe';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../stripe.service';
import { AdminActionsService } from '../../admin/admin-actions.service';
import { ConnectAccountsService, isPayable } from './connect-accounts.service';
import type { Profile } from '../../common/types';

/** Definitive refusals a retry with the same inputs cannot change. */
const DEFINITIVE_STRIPE_ERRORS = new Set([
  'StripeInvalidRequestError',
  'StripePermissionError',
  'StripeIdempotencyError',
  'StripeCardError',
]);

/** Definitive failures before the platform stops trying and leaves it to a human. */
export const MAX_TRANSFER_ATTEMPTS = 3;

/** How long a `pending` transfer may sit before the sweep picks it up again. */
const STALE_PENDING_MS = 5 * 60 * 1000;

/** Backoff after the Nth definitive failure. */
const FAILED_BACKOFF_MS = [0, 60 * 60 * 1000, 6 * 60 * 60 * 1000];

export type TransferOutcome =
  'transferred' | 'not_eligible' | 'failed' | 'abandoned' | 'retry' | 'skipped';

interface TransferEscrow {
  id: string;
  job_id: string;
  provider_id: string;
  amount: number | string;
  commission_amount: number | string;
  status: string;
  funding_method: 'wallet' | 'card';
  funding_charge_id: string | null;
  transfer_status: string;
  transfer_attempts: number;
}

/**
 * How much, in the settlement currency's minor units, to send the provider
 * for a card-funded job — the heart of why only card-funded payouts go to
 * Stripe (BACKEND_SCHEMA.md §29.5).
 *
 * Stripe has no Philippine accounts, so the ₱ charge settled into the
 * platform's balance in the platform's currency, and a transfer sourced from
 * it must be in that currency. The charge's balance transaction says what the
 * peso charge became; the provider's share of *that* is the same fraction of
 * it as their net payout is of the peso charge. Stripe's own rate for this
 * very payment, not one we chose.
 *
 * Integer minor units throughout, floored (never overpay by a centavo of
 * rounding), and capped at what the charge actually settled for — a
 * `source_transaction` transfer cannot exceed it. If the platform ever
 * settles in pesos, it is simply the net in centavos.
 *
 * The basis is the *gross* settled amount, so the platform bears Stripe's
 * processing fee and FX spread out of its commission (§29.5).
 */
export function computeTransferAmount(input: {
  settlementCurrency: string;
  settledAmountMinor: number;
  chargeAmountMinor: number;
  netPhp: number;
}): number {
  const netMinorPhp = Math.round(input.netPhp * 100);
  if (netMinorPhp <= 0 || input.settledAmountMinor <= 0) return 0;
  if (input.settlementCurrency.toLowerCase() === 'php') {
    return Math.min(netMinorPhp, input.settledAmountMinor);
  }
  if (input.chargeAmountMinor <= 0) return 0;
  return Math.min(
    input.settledAmountMinor,
    Math.floor(
      (input.settledAmountMinor * netMinorPhp) / input.chargeAmountMinor,
    ),
  );
}

/**
 * Sends a card-funded job's payout on to the provider's Stripe Connect
 * account (BACKEND_SCHEMA.md §29.5).
 *
 * By the time this runs the provider has already been paid in the ledger:
 * `escrow_settle` credited their wallet and marked the escrow
 * `transfer_status = 'pending'` in the same transaction as the release. This
 * is the second leg — move that money out of the platform to them — and it is
 * deliberately separate and best-effort. A Stripe outage must never fail a
 * job's completion, and nothing is lost if it fails: the money is still in
 * their wallet, and the sweep (`sweep()`) or an admin tries again.
 *
 * The ledger side of a transfer is a `connect_transfer` debit, reserved
 * `pending` before Stripe is asked (so it cannot also be withdrawn by hand),
 * completed with the transfer id on success, and failed — money back in the
 * available balance — on a definitive refusal.
 */
@Injectable()
export class ConnectPayoutsService {
  private readonly logger = new Logger(ConnectPayoutsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly accounts: ConnectAccountsService,
    private readonly adminActions: AdminActionsService,
  ) {}

  /** Attempts one escrow's transfer. Never throws — see the class comment. */
  async processEscrow(escrowId: string): Promise<TransferOutcome> {
    try {
      return await this.attempt(escrowId);
    } catch (err) {
      this.logger.error(
        `Transfer for escrow ${escrowId} errored and stays queued: ${(err as Error).message}`,
      );
      return 'retry';
    }
  }

  /**
   * The payments sweep: transfers left `pending` (a crash, or a Stripe error
   * we could not classify) and `failed` ones whose backoff has passed.
   */
  async sweep(now = new Date()): Promise<Record<TransferOutcome, number>> {
    const counts: Record<TransferOutcome, number> = {
      transferred: 0,
      not_eligible: 0,
      failed: 0,
      abandoned: 0,
      retry: 0,
      skipped: 0,
    };
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .select('id, transfer_status, transfer_attempts, transfer_attempted_at')
      .in('transfer_status', ['pending', 'failed'])
      .order('transfer_attempted_at', { ascending: true, nullsFirst: true })
      .limit(50);
    if (error) throw new Error(`Transfer sweep read failed: ${error.message}`);

    for (const row of (data ?? []) as {
      id: string;
      transfer_status: string;
      transfer_attempts: number;
      transfer_attempted_at: string | null;
    }[]) {
      const last = row.transfer_attempted_at
        ? new Date(row.transfer_attempted_at).getTime()
        : 0;
      const wait =
        row.transfer_status === 'pending'
          ? STALE_PENDING_MS
          : (FAILED_BACKOFF_MS[row.transfer_attempts] ?? Infinity);
      if (row.transfer_attempted_at && now.getTime() - last < wait) continue;
      counts[await this.processEscrow(row.id)]++;
    }
    return counts;
  }

  /**
   * An admin's "Retry transfer" on the console — for a transfer that failed,
   * was given up on, or found the provider not yet payable (and they have
   * since finished onboarding). Audited like every admin money action.
   */
  async retryForAdmin(admin: Profile, escrowId: string) {
    // The attempt count is kept, not reset: the idempotency key includes it,
    // and Stripe caches a definitive error under a key for 24 hours — a reset
    // would replay the very refusal the admin is retrying past. Each retry is
    // one more attempt under a fresh key; failing again parks it again.
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .update({ transfer_status: 'pending', transfer_last_error: null })
      .eq('id', escrowId)
      .eq('funding_method', 'card')
      .eq('status', 'released')
      .in('transfer_status', ['failed', 'abandoned', 'not_eligible'])
      .select('id, transfer_attempts')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new NotFoundException(
        'No failed or waiting card-funded transfer for this escrow',
      );
    }
    await this.adminActions.record(
      admin,
      'escrow.retry_transfer',
      'escrow_transactions',
      escrowId,
      {
        attempts_so_far: (data as { transfer_attempts: number })
          .transfer_attempts,
      },
    );
    return { outcome: await this.processEscrow(escrowId) };
  }

  // ── The attempt ───────────────────────────────────────────────────────────

  private async attempt(escrowId: string): Promise<TransferOutcome> {
    const escrow = await this.load(escrowId);
    if (
      !escrow ||
      escrow.status !== 'released' ||
      escrow.funding_method !== 'card' ||
      !escrow.funding_charge_id ||
      !['pending', 'failed'].includes(escrow.transfer_status)
    ) {
      return 'skipped';
    }

    const account = await this.accounts.findByProfile(escrow.provider_id);
    if (!account || !isPayable(account)) {
      const moved = await this.markEscrow(escrow, {
        transfer_status: 'not_eligible',
        transfer_attempted_at: new Date().toISOString(),
      });
      if (moved) {
        await this.notify(
          escrow.provider_id,
          'Payout added to your wallet',
          'This card-paid job was paid into your TaskBuddy wallet. Set up payouts (Profile → Payouts) to have card-paid jobs sent to your bank automatically.',
          escrow.job_id,
        );
      }
      return 'not_eligible';
    }

    const netPhp = round2(
      Number(escrow.amount) - Number(escrow.commission_amount),
    );
    const charge = await this.stripeService.stripe.charges.retrieve(
      escrow.funding_charge_id,
      { expand: ['balance_transaction'] },
    );
    const bt = charge.balance_transaction as Stripe.BalanceTransaction | null;
    if (!bt || typeof bt === 'string') {
      throw new Error(`Charge ${charge.id} has no balance transaction yet`);
    }
    const amountMinor = computeTransferAmount({
      settlementCurrency: bt.currency,
      settledAmountMinor: bt.amount,
      chargeAmountMinor: charge.amount,
      netPhp,
    });
    if (amountMinor <= 0) {
      return this.giveUp(escrow, 'Nothing to transfer after commission');
    }

    // Reserve the ledger debit first: from here the provider cannot withdraw
    // by hand the same money Stripe is about to send.
    const { data: reserved, error: reserveError } =
      await this.supabase.admin.rpc('wallet_reserve_connect_transfer', {
        p_escrow_id: escrow.id,
        p_amount: netPhp,
        p_title: 'Sent to your Stripe account',
      });
    if (reserveError) {
      if (reserveError.code === 'TB402' || reserveError.code === 'TB404') {
        // They already withdrew it by hand, or there is no payout to send.
        // Either way it is not ours to move; say why and stop.
        return this.giveUp(escrow, reserveError.message);
      }
      throw new Error(reserveError.message);
    }
    const reservation = reserved as {
      id: string;
      status: string;
      stripe_transfer_id: string | null;
    };
    if (reservation.status === 'completed') {
      // A previous attempt finished the ledger but not the escrow row.
      return this.finish(
        escrow,
        reservation.stripe_transfer_id,
        amountMinor,
        bt.currency,
      );
    }

    const destination = account.stripe_account_id;
    const transferGroup = `job:${escrow.job_id}`;
    try {
      // Adopt a transfer an earlier attempt made but did not record — Stripe
      // keeps idempotency keys for 24 hours, so a key alone is not enough to
      // stop a second transfer on a retry the next day.
      const earlier = await this.stripeService.stripe.transfers.list({
        destination,
        transfer_group: transferGroup,
        limit: 10,
      });
      const adopted = earlier.data.find(
        (t) => t.metadata?.escrow_id === escrow.id && !t.reversed,
      );
      const transfer =
        adopted ??
        (await this.stripeService.stripe.transfers.create(
          {
            amount: amountMinor,
            currency: bt.currency,
            destination,
            // Sourced from this job's own charge: converted at the rate that
            // charge settled at, and payable before the charge's funds are
            // available in the platform balance.
            source_transaction: charge.id,
            transfer_group: transferGroup,
            description: `TaskBuddy payout — job ${escrow.job_id}`,
            metadata: {
              escrow_id: escrow.id,
              job_id: escrow.job_id,
              provider_id: escrow.provider_id,
              net_php: netPhp.toFixed(2),
            },
          },
          {
            idempotencyKey: `escrow-transfer:${escrow.id}:${escrow.transfer_attempts}`,
            timeout: 10_000,
            maxNetworkRetries: 2,
          },
        ));

      await this.supabase.admin
        .from('wallet_transactions')
        .update({ status: 'completed', stripe_transfer_id: transfer.id })
        .eq('id', reservation.id)
        .eq('status', 'pending');
      return this.finish(
        escrow,
        transfer.id,
        transfer.amount,
        transfer.currency,
      );
    } catch (err) {
      const type = (err as { type?: string }).type ?? '';
      if (!DEFINITIVE_STRIPE_ERRORS.has(type)) {
        // Connection, API or rate-limit error: Stripe may or may not have made
        // the transfer. Leave everything pending — the reservation included —
        // and let the sweep retry with the same idempotency key, which returns
        // the original result if there was one.
        await this.markEscrow(escrow, {
          transfer_attempted_at: new Date().toISOString(),
          transfer_last_error: truncate((err as Error).message),
        });
        this.logger.warn(
          `Transfer for escrow ${escrow.id} hit ${type || 'an error'}; will retry`,
        );
        return 'retry';
      }

      // Stripe refused it. Release the reservation so the money is back in the
      // provider's available balance, and count the attempt.
      await this.supabase.admin
        .from('wallet_transactions')
        .update({
          status: 'failed',
          review_note: truncate((err as Error).message),
        })
        .eq('id', reservation.id)
        .eq('status', 'pending');
      const attempts = escrow.transfer_attempts + 1;
      const final = attempts >= MAX_TRANSFER_ATTEMPTS;
      await this.markEscrow(escrow, {
        transfer_status: final ? 'abandoned' : 'failed',
        transfer_attempts: attempts,
        transfer_attempted_at: new Date().toISOString(),
        transfer_last_error: truncate((err as Error).message),
      });
      await this.notify(
        escrow.provider_id,
        'Payout kept in your wallet',
        final
          ? 'We could not send this payout to your Stripe account, so it is in your TaskBuddy wallet. You can withdraw it from the Wallet tab.'
          : 'We could not send this payout to your Stripe account yet. It is in your TaskBuddy wallet and we will try again.',
        escrow.job_id,
      );
      this.logger.warn(
        `Stripe refused transfer for escrow ${escrow.id} (${type}): ${(err as Error).message}`,
      );
      return final ? 'abandoned' : 'failed';
    }
  }

  private async finish(
    escrow: TransferEscrow,
    transferId: string | null,
    amountMinor: number,
    currency: string,
  ): Promise<TransferOutcome> {
    await this.markEscrow(escrow, {
      transfer_status: 'transferred',
      stripe_transfer_id: transferId,
      transfer_amount_minor: amountMinor,
      transfer_currency: currency,
      transferred_at: new Date().toISOString(),
      transfer_attempted_at: new Date().toISOString(),
      transfer_last_error: null,
    });
    await this.notify(
      escrow.provider_id,
      'Payout sent to your Stripe account',
      'Your payout for a card-paid job is on its way to your bank through Stripe.',
      escrow.job_id,
    );
    return 'transferred';
  }

  private async giveUp(
    escrow: TransferEscrow,
    reason: string,
  ): Promise<TransferOutcome> {
    await this.markEscrow(escrow, {
      transfer_status: 'abandoned',
      transfer_attempted_at: new Date().toISOString(),
      transfer_last_error: truncate(reason),
    });
    this.logger.warn(`Transfer for escrow ${escrow.id} abandoned: ${reason}`);
    return 'abandoned';
  }

  /**
   * Updates the transfer columns, conditional on the transfer still being
   * where this attempt found it — a sweep and an admin retry racing each
   * other both read `pending`, and only one should record the outcome.
   * Returns whether it applied.
   */
  private async markEscrow(
    escrow: TransferEscrow,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .update(patch)
      .eq('id', escrow.id)
      .eq('transfer_status', escrow.transfer_status)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
  }

  private async load(escrowId: string): Promise<TransferEscrow | null> {
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .select(
        'id, job_id, provider_id, amount, commission_amount, status, funding_method, funding_charge_id, transfer_status, transfer_attempts',
      )
      .eq('id', escrowId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  }

  private async notify(
    recipientId: string,
    title: string,
    body: string,
    jobId: string,
  ) {
    const { error } = await this.supabase.admin.from('notifications').insert({
      recipient_id: recipientId,
      type: 'wallet_update',
      title,
      body,
      data: { job_id: jobId },
    });
    if (error) this.logger.warn(`Notification not written: ${error.message}`);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function truncate(message: string): string {
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}
