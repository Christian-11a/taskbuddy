import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListTransactionsQueryDto } from './dto/escrow.dto';
import { moneyError } from './escrow-errors';

export type EscrowStatus =
  'held' | 'released' | 'disputed' | 'refunded' | 'cancelled';

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
  constructor(private readonly supabase: SupabaseService) {}

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
   * Called when the client completes the job: pay the provider.
   *
   * Raises rather than returning null when there is nothing to release. This
   * used to no-op silently, which was safe only because `JobsService.complete`
   * blocks a second completion on job status before ever reaching here. A
   * silent no-op is the wrong contract for a money mover: any second call site
   * (a retried webhook, a payout rail) would read success and believe a
   * provider had been paid twice over.
   *
   * `releaseIfHeld` is the caller-facing wrapper that tolerates the absences a
   * normal completion legitimately reaches; see `JobsService.complete`.
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
   * `release`, but tolerant of the two states a normal completion legitimately
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
    const commission = round2(amount * (await this.commissionRate()));
    const title = await this.jobTitle(escrow.job_id);
    return this.settle(escrow, 'released', {
      commission,
      title:
        commission > 0
          ? `Payout — ${title} (less ${commission.toFixed(2)} platform fee)`
          : `Payout — ${title}`,
    });
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
    return (data as EscrowRow | null) ?? null;
  }

  /**
   * The configured cut, as a fraction. Falls back to zero rather than throwing:
   * a settings row that cannot be read must not strand a provider's payout,
   * and zero is the direction that errs in the user's favour.
   */
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
