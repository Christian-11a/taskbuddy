import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListTransactionsQueryDto } from './dto/escrow.dto';
import { moneyError } from './escrow-errors';
import { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';
import {
  PAYOUT_FAILED,
  PAYOUT_SUCCEEDED,
  XenditRequestError,
  XenditService,
  type XenditPayoutUpdate,
} from '../payments/xendit.service';

/**
 * How long a completed job's payment is held before it is released. Zero since
 * migration 0060: the payment is released as soon as the client confirms the
 * job is complete. Kept as a constant so `warranty_expires_at` (= completion
 * time) and the reconciliation sweep keep one definition.
 */
export const WARRANTY_DURATION_MS = 0;

export type EscrowStatus =
  'held' | 'released' | 'disputed' | 'refunded' | 'cancelled';

/** review_note on a payout pass_through_balances queued for Xendit (0058). */
const QUEUED_NOTE = 'Sending via Xendit';
/** A queued payout one sender has claimed and is sending right now. */
const IN_FLIGHT_NOTE = 'Sending via Xendit (in flight)';
/** Xendit accepted the payout; its final result is still to come. */
const ACCEPTED_PREFIX = 'XENDIT-';
/** Definite refusals for one payout account before retries stop. */
const MAX_REFUSALS_PER_ACCOUNT = 3;
/** Rows read per reconciliation page, and Xendit lookups allowed per tick. */
const RECONCILE_PAGE = 50;
const RECONCILE_MAX_LOOKUPS = 200;

export interface EscrowRow {
  id: string;
  job_id: string;
  client_id: string;
  provider_id: string;
  amount: number | string;
  status: EscrowStatus;
  held_at: string;
  released_at: string | null;
  refunded_at: string | null;
  /** Withheld at release; 0 until a commission rate is configured (0024). */
  commission_amount: number | string;
  /** Rate locked when the escrow was held (0067); null on older rows. */
  commission_rate?: number | string | null;
  /** How the hold was funded (0028): from a wallet balance, or a card at hire. */
  funding_method?: 'wallet' | 'card';
  funding_payment_intent_id?: string | null;
  funding_charge_id?: string | null;
  /** Card-funded payouts only: where the onward Stripe transfer stands (0028). */
  transfer_status?:
    | 'none'
    | 'pending'
    | 'transferred'
    | 'failed'
    | 'not_eligible'
    | 'abandoned';
}

/**
 * What a `hold()` call did.
 *
 * `placed` is the part callers cannot work out for themselves: `hold()` is
 * idempotent, so a second accept for the same provider gets the *existing*
 * hold back and is debited nothing. A caller that then wants to undo its own
 * hold must know which of those two it was — see `ApplicationsService.accept`,
 * where getting this wrong would refund the escrow of a hire that succeeded.
 */
export interface HoldResult {
  /** The hold, or null for a job posted without a budget. */
  escrow: EscrowRow | null;
  /** True only when this call actually debited the client. */
  placed: boolean;
}

/** A hold paid for by a card at hire, recorded so the payout can follow it. */
export interface CardFunding {
  paymentIntentId: string;
  chargeId: string;
}

/**
 * Escrow state for a job, from assignment to payout.
 *
 * Money moves through the `wallet_transactions` ledger, which is the only
 * account of record (Stripe reports money arriving; the ledger records it,
 * §21): the client is debited when escrow is held, the provider credited on
 * release, and the client credited back on cancellation or refund.
 *
 * Every move is one call to a SQL function (migration 0028, BACKEND_SCHEMA.md
 * §29.2) that changes the escrow row *and* writes its ledger row in a single
 * transaction, behind a per-wallet advisory lock. This service used to make
 * those two writes as separate PostgREST calls, so a failure between them
 * left a hold no debit backed, or a release with no payout. What stays here is
 * the part that is policy rather than bookkeeping: which move a caller means,
 * what the ledger line says, and the commission rate.
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly connectPayouts: ConnectPayoutsService,
    private readonly xendit: XenditService,
  ) {}

  /**
   * Called when an application is accepted — from the wallet, or by the card
   * webhook with the payment that funded it. Jobs posted without a budget
   * (every job created before migration 0007) get no escrow, and the rest of
   * the lifecycle then no-ops for them.
   *
   * Throws `InsufficientBalanceError` when the client can't cover the budget,
   * and `EscrowConflictError` when the job is already held for another
   * provider or its escrow is settled. `ApplicationsService.accept` calls this
   * *before* it accepts the application, so a refusal cannot leave a hired
   * provider behind it.
   *
   * Idempotent: a retried accept gets the existing hold back with
   * `placed: false`; a hold a failed hire rolled back is revived and debited
   * again (`escrow_place_hold` documents the cases).
   */
  async hold(
    jobId: string,
    providerId: string,
    funding?: CardFunding,
  ): Promise<HoldResult> {
    const { data, error } = await this.supabase.admin.rpc('escrow_place_hold', {
      p_job_id: jobId,
      p_provider_id: providerId,
      p_funding_method: funding ? 'card' : 'wallet',
      p_payment_intent_id: funding?.paymentIntentId ?? null,
      p_charge_id: funding?.chargeId ?? null,
    });
    if (error) throw moneyError(error);
    const result = data as HoldResult | null;
    return { escrow: result?.escrow ?? null, placed: result?.placed === true };
  }

  /**
   * Undoes a hold placed for a hire that then failed to go through. Distinct
   * from `cancelForJob` only in the ledger line the client reads: nothing
   * about their job was cancelled, the hire simply did not complete.
   */
  async releaseHoldForFailedHire(jobId: string): Promise<void> {
    const escrow = await this.findByJob(jobId);
    if (!escrow || escrow.status !== 'held') return;
    // Quietly: if something else already moved this escrow on, the money is
    // no longer where this rollback thought it was, and the only thing left
    // to get wrong is crediting the client for it twice. The conditional in
    // escrow_settle is what prevents that.
    await this.settleIfUnchanged(escrow, 'cancelled', {
      title: `Refund — hire did not complete: ${await this.jobTitle(jobId)}`,
    });
  }

  /**
   * Called when the client confirms the job is complete: pay the provider.
   *
   * Raises rather than returning null when there is nothing to release. This
   * used to no-op silently, which was safe only because `JobsService.complete`
   * blocks a second completion on job status before ever reaching here. A
   * silent no-op is the wrong contract for a money mover: any second call site
   * (a retried webhook, a payout rail) would read success and believe a
   * provider had been paid twice over.
   *
   * `releaseIfHeld` is the caller-facing wrapper that tolerates the absences a
   * warranty reconciliation legitimately reaches.
   */
  async release(jobId: string): Promise<EscrowRow> {
    const escrow = await this.findByJob(jobId);
    if (!escrow) {
      throw new BadRequestException('No escrow hold exists for this job.');
    }
    if (escrow.status !== 'held') {
      throw new ConflictException(
        `Escrow is already '${escrow.status}' — cannot release again.`,
      );
    }
    return this.payOut(escrow);
  }

  /**
   * Sends the money a settlement just put on the ledger straight back out:
   * a payout to the provider's linked GCash/Maya/bank account, a refund to
   * the client's original payment method (migration 0056). TaskBuddy keeps
   * no balances. Never throws: the settlement is already committed, and the
   * payments tick sends anything this misses.
   */
  async passThrough(profileIds: string[]): Promise<void> {
    for (const id of new Set(profileIds)) {
      const { error } = await this.supabase.admin.rpc('pass_through_balances', {
        p_profile_id: id,
        p_queue_provider_payouts: this.xendit.configured,
      });
      if (error)
        this.logger.error(`Pass-through for ${id} failed: ${error.message}`);
      else await this.sendQueuedPayouts(id);
    }
  }

  /**
   * Sends the provider payouts pass_through_balances queued (migration 0058)
   * through Xendit's sandbox Payouts API. Never throws.
   *
   * A payout is paid once, whatever fails:
   * - each row is claimed (queued -> in flight) before it is sent, so two
   *   senders (the tick and a request path) cannot both send it;
   * - the ledger row id is the Xendit reference and idempotency key, so a
   *   resend of the same row cannot pay twice;
   * - accepted is not paid: the row stays pending (money still reserved)
   *   until the payout callback or a lookup gives the final result;
   * - only a definite refusal marks it failed (which frees the money for a
   *   new payout). A timeout, 5xx or rate limit puts it back in the queue
   *   to be resent under the same reference.
   * The tick (no profileId) also reconciles in-flight and accepted rows.
   */
  async sendQueuedPayouts(profileId?: string): Promise<number> {
    if (!this.xendit.configured) return 0;
    if (!profileId) await this.reconcilePayouts();
    let query = this.supabase.admin
      .from('wallet_transactions')
      .select('id, profile_id, amount, title')
      .eq('kind', 'withdrawal')
      .eq('status', 'pending')
      .eq('review_note', QUEUED_NOTE)
      .limit(50);
    if (profileId) query = query.eq('profile_id', profileId);
    const { data: rows, error } = await query;
    if (error) {
      this.logger.error(`Queued payouts not read: ${error.message}`);
      return 0;
    }
    let sent = 0;
    for (const row of (rows ?? []) as {
      id: string;
      profile_id: string;
      amount: number | string;
      title: string;
    }[]) {
      const { data: account } = await this.supabase.admin
        .from('linked_payout_accounts')
        .select('channel_code, account_name, account_number, updated_at')
        .eq('profile_id', row.profile_id)
        .maybeSingle();
      // An account Xendit keeps refusing is not retried until it changes;
      // the payout stays queued (money reserved) and the provider was told.
      if (account && (await this.accountKeepsFailing(row.profile_id, account)))
        continue;
      if (!(await this.claimPayout(row.id))) continue;
      try {
        if (!account?.channel_code)
          throw new XenditRequestError('No payout account linked', 400);
        const payout = await this.xendit.sendPayout({
          referenceId: row.id,
          channelCode: account.channel_code,
          accountName: account.account_name,
          accountNumber: account.account_number,
          amount: Number(row.amount),
          description: 'TaskBuddy payout',
        });
        await this.applyPayoutResult({
          payoutId: payout.id,
          referenceId: row.id,
          status: (payout.status ?? 'ACCEPTED').toUpperCase(),
          failureCode: null,
        });
        sent += 1;
      } catch (err) {
        const message = (err as Error).message.slice(0, 200);
        if (err instanceof XenditRequestError && err.definite) {
          this.logger.error(`Payout ${row.id} refused: ${message}`);
          await this.failPayout(row.id, row.profile_id, `Xendit: ${message}`);
        } else {
          // Unknown outcome (timeout, 5xx, rate limit, duplicate): Xendit may
          // have the payout. Ask it; if it has none, resend later under the
          // same reference rather than freeing the money.
          this.logger.warn(`Payout ${row.id} outcome unknown: ${message}`);
          await this.settleUnknownPayout(row.id);
        }
      }
    }
    return sent;
  }

  /**
   * Applies a payout's state from Xendit (callback or lookup) to its ledger
   * row. Only a pending row changes, so a repeated or late update is a no-op.
   */
  async applyPayoutResult(update: XenditPayoutUpdate): Promise<void> {
    const { data: row, error } = await this.supabase.admin
      .from('wallet_transactions')
      .select('id, profile_id, status, review_note')
      .eq('id', update.referenceId)
      .eq('kind', 'withdrawal')
      .maybeSingle();
    if (error) {
      this.logger.error(
        `Payout ${update.referenceId} not read: ${error.message}`,
      );
      return;
    }
    if (!row) {
      this.logger.warn(`Payout update for unknown row ${update.referenceId}`);
      return;
    }
    // A row already tied to one Xendit payout ignores updates for another.
    const note = (row.review_note as string | null) ?? '';
    if (
      note.startsWith(ACCEPTED_PREFIX) &&
      note !== `${ACCEPTED_PREFIX}${update.payoutId}`
    ) {
      this.logger.warn(
        `Payout ${row.id} update for ${update.payoutId} ignored; row holds ${note}`,
      );
      return;
    }
    if (row.status !== 'pending') {
      if (row.status === 'completed' && update.status === 'REVERSED')
        await this.alertReversedPayout(row.id as string, update.payoutId);
      return;
    }
    if (PAYOUT_SUCCEEDED.has(update.status)) {
      await this.finishPayout(
        row.id,
        'completed',
        `${ACCEPTED_PREFIX}${update.payoutId}`,
      );
    } else if (PAYOUT_FAILED.has(update.status)) {
      await this.failPayout(
        row.id,
        row.profile_id as string,
        `Xendit: ${update.failureCode ?? update.status}`,
      );
    } else {
      const { error: noteError } = await this.supabase.admin
        .from('wallet_transactions')
        .update({ review_note: `${ACCEPTED_PREFIX}${update.payoutId}` })
        .eq('id', row.id)
        .eq('status', 'pending');
      if (noteError)
        this.logger.error(
          `Payout ${row.id} not marked accepted: ${noteError.message}`,
        );
    }
  }

  /**
   * Asks Xendit about payouts that are in flight (a sender may have crashed)
   * or accepted (the callback may be lost), oldest first, page by page, up
   * to a cap of lookups per tick. One that Xendit never received goes back in
   * the queue, to be resent under the same reference.
   */
  private async reconcilePayouts(): Promise<void> {
    let lookups = 0;
    for (let offset = 0; lookups < RECONCILE_MAX_LOOKUPS;) {
      const { data: rows, error } = await this.supabase.admin
        .from('wallet_transactions')
        .select('id, review_note')
        .eq('kind', 'withdrawal')
        .eq('status', 'pending')
        .or(
          `review_note.eq."${IN_FLIGHT_NOTE}",review_note.like.${ACCEPTED_PREFIX}*`,
        )
        .order('created_at', { ascending: true })
        .range(offset, offset + RECONCILE_PAGE - 1);
      if (error) {
        this.logger.error(`Payouts not reconciled: ${error.message}`);
        return;
      }
      const page = (rows ?? []) as { id: string; review_note: string }[];
      let stillOpen = 0;
      for (const row of page) {
        if (lookups >= RECONCILE_MAX_LOOKUPS) return;
        lookups += 1;
        try {
          const found = await this.xendit.findPayoutByReference(row.id);
          if (found) await this.applyPayoutResult(found);
          else if (row.review_note === IN_FLIGHT_NOTE)
            await this.setPayoutNote(row.id, IN_FLIGHT_NOTE, QUEUED_NOTE);
          else {
            this.logger.warn(`Payout ${row.id} accepted but unknown to Xendit`);
            stillOpen += 1;
          }
          if (
            found &&
            !PAYOUT_SUCCEEDED.has(found.status) &&
            !PAYOUT_FAILED.has(found.status)
          )
            stillOpen += 1;
        } catch (err) {
          stillOpen += 1;
          this.logger.warn(
            `Payout ${row.id} not reconciled: ${(err as Error).message}`,
          );
        }
      }
      if (page.length < RECONCILE_PAGE) return;
      // Rows settled in this page left the filter; only skip those still open.
      offset += stillOpen;
    }
  }

  /** After an unknown outcome: apply what Xendit has, or requeue the row. */
  private async settleUnknownPayout(id: string): Promise<void> {
    try {
      const found = await this.xendit.findPayoutByReference(id);
      if (found) {
        await this.applyPayoutResult(found);
        return;
      }
    } catch (err) {
      this.logger.warn(`Payout ${id} lookup failed: ${(err as Error).message}`);
    }
    await this.setPayoutNote(id, IN_FLIGHT_NOTE, QUEUED_NOTE);
  }

  /**
   * True when Xendit has definitely refused this account's payouts
   * MAX_REFUSALS_PER_ACCOUNT times since the account was last changed.
   */
  private async accountKeepsFailing(
    profileId: string,
    account: { updated_at?: string | null },
  ): Promise<boolean> {
    let query = this.supabase.admin
      .from('wallet_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('kind', 'withdrawal')
      .eq('status', 'failed')
      .like('review_note', 'Xendit:%');
    if (account.updated_at) query = query.gte('created_at', account.updated_at);
    const { count, error } = await query;
    if (error) {
      this.logger.error(`Payout refusals not counted: ${error.message}`);
      return false;
    }
    return (count ?? 0) >= MAX_REFUSALS_PER_ACCOUNT;
  }

  /** A completed payout Xendit later reversed: admins must check it. */
  private async alertReversedPayout(id: string, payoutId: string) {
    this.logger.error(
      `Payout ${id} (${payoutId}) was reversed after completing`,
    );
    const { error } = await this.supabase.admin.rpc('write_admin_alert', {
      p_event_key: `payout_reversed:${id}`,
      p_title: 'Payout reversed',
      p_body:
        'Xendit reversed a payout that was already marked sent. Check the provider and the payment records.',
      p_data: {
        target: 'withdrawals',
        wallet_transaction_id: id,
        payout_id: payoutId,
      },
    });
    if (error)
      this.logger.error(`Reversed payout ${id} not alerted: ${error.message}`);
  }

  /** Queued -> in flight, for this sender only. */
  private async claimPayout(id: string): Promise<boolean> {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .update({ review_note: IN_FLIGHT_NOTE })
      .eq('id', id)
      .eq('status', 'pending')
      .eq('review_note', QUEUED_NOTE)
      .select('id')
      .maybeSingle();
    if (error) {
      this.logger.error(`Payout ${id} not claimed: ${error.message}`);
      return false;
    }
    return data !== null;
  }

  private async setPayoutNote(id: string, from: string, to: string) {
    const { error } = await this.supabase.admin
      .from('wallet_transactions')
      .update({ review_note: to })
      .eq('id', id)
      .eq('status', 'pending')
      .eq('review_note', from);
    if (error)
      this.logger.error(`Payout ${id} note not reset: ${error.message}`);
  }

  /** Marks a payout failed (freeing its money) and tells the provider once. */
  private async failPayout(id: string, profileId: string, note: string) {
    const failed = await this.finishPayout(id, 'failed', note);
    if (!failed) return;
    const { error } = await this.supabase.admin.from('notifications').insert({
      recipient_id: profileId,
      type: 'wallet_update',
      title: 'Payout not sent',
      body: 'We could not send a payout to your payout account. Check that its details are correct; we will try again automatically.',
      data: {},
    });
    if (error)
      this.logger.error(`Payout ${id} failure not notified: ${error.message}`);
  }

  /** Returns whether this call changed the row. */
  private async finishPayout(
    id: string,
    status: 'completed' | 'failed',
    note: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .update({ status, review_note: note })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      this.logger.error(`Payout ${id} not marked ${status}: ${error.message}`);
      return false;
    }
    return (data ?? []).length > 0;
  }

  /**
   * `release`, but tolerant of the two states warranty reconciliation legitimately
   * reaches it in: a job posted without a budget (no escrow row at all), and a
   * disputed escrow, which is frozen until an admin decides it either way.
   * Anything else still throws, so a genuinely wrong release is loud.
   */
  async releaseIfHeld(jobId: string): Promise<EscrowRow | null> {
    const escrow = await this.findByJob(jobId);
    if (!escrow || escrow.status === 'disputed') return null;
    if (escrow.status !== 'held') {
      throw new ConflictException(
        `Escrow is already '${escrow.status}' — cannot release again.`,
      );
    }
    return this.payOut(escrow);
  }

  /**
   * Called when a job is cancelled. The client was debited when the hold was
   * created, so cancelling has to give it back. Disputed escrows are left alone
   * for an admin to resolve.
   *
   * Quiet when it loses: a client tapping Cancel while the provider taps
   * Decline is two endpoints reaching the same escrow, and cancelling a job
   * whose money has already gone back is the outcome the caller wanted. What
   * it must not do is credit the client a second time — escrow_settle's
   * conditional update is what makes exactly one of them win.
   */
  async cancelForJob(jobId: string): Promise<EscrowRow | null> {
    const escrow = await this.findByJob(jobId);
    if (!escrow || escrow.status !== 'held') return null;
    return this.settleIfUnchanged(escrow, 'cancelled', {
      title: `Refund — job cancelled: ${await this.jobTitle(jobId)}`,
    });
  }

  /**
   * Job completed, or a dispute resolved in the provider's favour.
   *
   * This is the only place the platform takes a cut. The rate is read now,
   * at release, and then frozen onto the escrow row — reading the live setting
   * later to explain an old payout would misreport every job that settled
   * under a different rate. The default rate is 0, so until an admin sets one
   * this behaves exactly as it did before commission existed.
   *
   * The commission deliberately gets no ledger row: `wallet_transactions` is
   * keyed by profile and the platform is not a profile. The ledger therefore
   * no longer nets to zero across a released job — the shortfall is exactly
   * the commission, which is the correct statement that the money left user
   * wallets and did not arrive in another.
   */
  async payOut(escrow: EscrowRow): Promise<EscrowRow> {
    if (escrow.status !== 'held' && escrow.status !== 'disputed') {
      throw new ConflictException(
        `Escrow is already '${escrow.status}' — cannot pay it out.`,
      );
    }
    const amount = Number(escrow.amount);
    const commission = commissionOf(
      amount,
      await this.effectiveRate(escrow.commission_rate),
    );
    const title = await this.jobTitle(escrow.job_id);
    const released = await this.settle(escrow, 'released', {
      commission,
      title:
        commission > 0
          ? `Payout — ${title} (less ${commission.toFixed(2)} platform fee)`
          : `Payout — ${title}`,
    });

    // A card-funded payout goes on to the provider's Stripe account (§29.5).
    // The ledger credit above is already committed, and escrow_settle marked
    // the transfer `pending` in the same transaction, so this is the second
    // leg only — started, not awaited. A slow or failing Stripe call must
    // never hold up or fail a job's completion or a dispute's resolution;
    // processEscrow never throws, and the payments sweep picks up anything
    // this attempt does not finish.
    if (released.transfer_status === 'pending') {
      void this.connectPayouts.processEscrow(released.id);
    }
    return released;
  }

  /** Dispute resolved in the client's favour — return the held funds. */
  async refund(escrow: EscrowRow): Promise<EscrowRow> {
    if (escrow.status !== 'held' && escrow.status !== 'disputed') {
      throw new ConflictException(
        `Escrow is already '${escrow.status}' — cannot refund it.`,
      );
    }
    return this.settle(escrow, 'refunded', {
      title: `Refund — dispute resolved: ${await this.jobTitle(escrow.job_id)}`,
    });
  }

  /**
   * Freezes a held escrow for an admin to decide.
   *
   * Conditional on the row still being `held`, like every other transition
   * here. The caller checked `held` when it read the row, but a completion
   * can release it in between — and an unconditional flip would then turn
   * `released` back into `disputed`, after which resolving the dispute in the
   * provider's favour pays them a second time for the same job.
   */
  async markDisputed(escrow: EscrowRow): Promise<EscrowRow> {
    if (escrow.status !== 'held') {
      throw new ConflictException(
        `Cannot dispute a payment that is already '${escrow.status}'`,
      );
    }
    const updated = await this.settleIfUnchanged(escrow, 'disputed', {});
    if (!updated) {
      throw new ConflictException(
        'This payment was released or refunded while the dispute was being filed.',
      );
    }
    return updated;
  }

  async findByJob(jobId: string): Promise<EscrowRow | null> {
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .select('*')
      .eq('job_id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return (data as EscrowRow) ?? null;
  }

  /**
   * The admin Transactions page. Rows carry both parties and the service name,
   * which is the shape the console renders.
   */
  async listForAdmin(query: ListTransactionsQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const { data, error } = await this.supabase.admin.rpc(
      'admin_list_transactions',
      {
        p_search_term: query.search ?? null,
        p_status: query.status ?? null,
        p_limit: limit,
        p_offset: offset,
      },
    );
    if (error) throw new BadRequestException(error.message);
    const result = data?.[0];
    return {
      transactions: result?.rows ?? [],
      total: Number(result?.total ?? 0),
    };
  }

  /**
   * A move that must happen: raises when the escrow was no longer in the
   * status we read. Two admins resolving the same dispute both pass the
   * in-memory guard; the conditional in escrow_settle is what makes exactly
   * one of them pay, and this is where the other hears about it.
   */
  private async settle(
    escrow: EscrowRow,
    next: EscrowStatus,
    options: { commission?: number; title?: string },
  ): Promise<EscrowRow> {
    const updated = await this.settleIfUnchanged(escrow, next, options);
    if (!updated) {
      throw new ConflictException(
        'This escrow was already settled by someone else.',
      );
    }
    return updated;
  }

  /**
   * The same move, returning null instead of raising when it loses. For the
   * callers whose whole job is to end up in a state someone else may already
   * have reached — cancelling, and rolling a failed hire back. Losing there is
   * not an error; crediting the client anyway is, and cannot happen: the
   * ledger row is written in the same transaction as the winning update, or
   * not at all.
   */
  private async settleIfUnchanged(
    escrow: EscrowRow,
    next: EscrowStatus,
    options: { commission?: number; title?: string },
  ): Promise<EscrowRow | null> {
    const { data, error } = await this.supabase.admin.rpc('escrow_settle', {
      p_escrow_id: escrow.id,
      p_expected: escrow.status,
      p_next: next,
      p_commission: options.commission ?? 0,
      p_title: options.title ?? null,
    });
    if (error) throw moneyError(error);
    const settled = (data as EscrowRow | null) ?? null;
    if (settled && next !== 'disputed')
      await this.passThrough([settled.client_id, settled.provider_id]);
    return settled;
  }

  /**
   * The configured cut, as a fraction. Falls back to zero rather than throwing:
   * a settings row that cannot be read must not strand a provider's payout,
   * and zero is the direction that errs in the user's favour.
   */
  /**
   * The rate locked on the escrow at hire (0067), or the current platform rate
   * when the row has none (settled before 0067).
   */
  async effectiveRate(locked?: number | string | null): Promise<number> {
    if (locked !== null && locked !== undefined) {
      const rate = Number(locked);
      if (Number.isFinite(rate) && rate >= 0) return rate;
    }
    return this.commissionRate();
  }

  /**
   * What a provider would be charged on `amount`: same rate and same
   * rounding (round2) as payOut, so the preview equals the real deduction.
   */
  async feePreview(
    amount: number,
    locked?: number | string | null,
  ): Promise<{ rate: number; amount: number; provider_receives: number }> {
    const rate = await this.effectiveRate(locked);
    const fee = commissionOf(amount, rate);
    return {
      rate,
      amount: fee,
      provider_receives: (centavos(amount) - Math.round(fee * 100)) / 100,
    };
  }

  private async commissionRate(): Promise<number> {
    const { data, error } = await this.supabase.admin
      .from('platform_settings')
      .select('commission_rate')
      .eq('id', true)
      .maybeSingle();
    if (error || !data) return 0;
    const rate = Number(data.commission_rate ?? 0);
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  }

  private async jobTitle(jobId: string): Promise<string> {
    const { data } = await this.supabase.admin
      .from('jobs')
      .select('title')
      .eq('id', jobId)
      .maybeSingle();
    return (data?.title as string) ?? 'job';
  }
}

/** Decimal string scaled to an integer with 4 decimal places (no float drift). */
function scaled4(n: number | string): bigint {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0n;
  const [int, frac = ''] = Math.abs(v).toFixed(4).split('.');
  const out = BigInt(int + frac);
  return v < 0 ? -out : out;
}

/** An amount in whole centavos, rounded half away from zero like numeric round(x, 2). */
function centavos(amount: number | string): number {
  const a = scaled4(amount);
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const q = (abs + 50n) / 100n;
  return Number(neg ? -q : q);
}

/**
 * round(amount * rate, 2) exactly as PostgreSQL numeric does it (half away
 * from zero), using scaled integers so 160.45 * 0.10 is 16.05, not 16.04.
 */
function commissionOf(amount: number | string, rate: number | string): number {
  const p = scaled4(amount) * scaled4(rate); // scale 8
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const q = (abs + 500000n) / 1000000n; // to scale 2
  return Number(neg ? -q : q) / 100;
}
