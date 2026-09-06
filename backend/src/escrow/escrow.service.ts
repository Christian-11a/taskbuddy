import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { WalletService } from '../wallet/wallet.service';
import { ListTransactionsQueryDto } from './dto/escrow.dto';

export interface EscrowRow {
  id: string;
  job_id: string;
  client_id: string;
  provider_id: string;
  amount: number | string;
  status: 'held' | 'released' | 'disputed' | 'refunded' | 'cancelled';
  held_at: string;
  released_at: string | null;
  refunded_at: string | null;
  /** Withheld at release; 0 until a commission rate is configured (0023). */
  commission_amount: number | string;
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

/**
 * Escrow state for a job, from assignment to payout.
 *
 * Money moves through the `wallet_transactions` ledger, which is the only
 * account of record (there is no payment gateway): the client is debited when
 * escrow is held, the provider credited on release, and the client credited
 * back on cancellation or refund. Rows are tagged with `kind` so the admin
 * revenue query can count payouts without also counting refunds.
 */
@Injectable()
export class EscrowService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly wallet: WalletService,
  ) {}

  /**
   * Called when an application is accepted. Jobs posted without a budget — every
   * job created before migration 0007 — get no escrow, and the rest of the
   * lifecycle then no-ops for them.
   *
   * Throws when the client can't cover the budget: you cannot hold money that
   * isn't there, so the hire is refused rather than driving the wallet negative.
   * `ApplicationsService.accept` calls this *before* it accepts the
   * application, so that refusal cannot leave a hired provider behind it.
   *
   * Returns whether it actually debited anyone: a retried accept gets the
   * existing hold back untouched, and only the call that placed the money may
   * take it away again.
   */
  async hold(jobId: string, providerId: string): Promise<HoldResult> {
    const { data: job, error } = await this.supabase.admin
      .from('jobs')
      .select('id, title, budget, client_id')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!job || job.budget == null) return { escrow: null, placed: false };

    const existing = await this.findByJob(jobId);
    if (existing) return this.reuseHold(existing, providerId, job.title);

    const amount = Number(job.budget);
    // Available, not settled: a peso already promised to a pending withdrawal
    // cannot also fund a hire (see WalletService.availableBalanceFor).
    const balance = await this.wallet.availableBalanceFor(
      job.client_id as string,
    );
    if (balance < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance: ${peso(amount)} needed, ${peso(balance)} available. Add funds to your wallet before hiring.`,
      );
    }

    // Insert the escrow row first: job_id is unique, so a duplicate accept is
    // rejected here and can never debit the client twice.
    const { data, error: insertError } = await this.supabase.admin
      .from('escrow_transactions')
      .insert({
        job_id: jobId,
        client_id: job.client_id,
        provider_id: providerId,
        amount,
      })
      .select('*')
      .single();
    // Lost the race between the read above and this insert. Whoever won holds
    // the money; reconcile against their row rather than reporting a hold that
    // this call did not place.
    if (insertError?.code === '23505') {
      const raced = await this.findByJob(jobId);
      if (!raced) throw new BadRequestException(insertError.message);
      return this.reuseHold(raced, providerId, job.title);
    }
    if (insertError) throw new BadRequestException(insertError.message);

    await this.ledger({
      profileId: job.client_id as string,
      direction: 'debit',
      kind: 'escrow_hold',
      amount,
      title: `Escrow hold — ${job.title as string}`,
      jobId,
    });
    return { escrow: data as EscrowRow, placed: true };
  }

  /**
   * A hold already exists for this job. `job_id` is unique on
   * `escrow_transactions`, so this is where a second hire is reconciled
   * against the first rather than quietly inheriting its money.
   *
   * Three cases, and they are genuinely different:
   *
   * - **Same provider, still held.** A retried accept. Return the existing row;
   *   nobody is debited twice.
   * - **A different provider.** Two applications accepted in the same instant
   *   would otherwise assign the job to one provider while the money is held
   *   for another. Refused: the job already has a hire.
   * - **Cancelled.** The hold was rolled back after a failed hire (see
   *   `ApplicationsService.accept`) and the money returned. Revive it and debit
   *   again, so the retry actually holds funds instead of adopting an empty row.
   *
   * A released or refunded escrow is settled money and a disputed one is an
   * admin's to decide; neither may be re-held.
   */
  private async reuseHold(
    existing: EscrowRow,
    providerId: string,
    jobTitle: unknown,
  ): Promise<HoldResult> {
    if (existing.provider_id !== providerId) {
      throw new ConflictException(
        'This job already has an escrow hold for another provider.',
      );
    }
    // Nothing was debited, and `placed: false` is what stops the caller from
    // undoing a hold it did not place.
    if (existing.status === 'held') return { escrow: existing, placed: false };
    if (existing.status !== 'cancelled') {
      throw new ConflictException(
        `This job's escrow is already '${existing.status}' and cannot be re-held.`,
      );
    }

    const amount = Number(existing.amount);
    const balance = await this.wallet.availableBalanceFor(existing.client_id);
    if (balance < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance: ${peso(amount)} needed, ${peso(balance)} available. Add funds to your wallet before hiring.`,
      );
    }
    const revived = await this.settle(existing, {
      status: 'held',
      held_at: new Date().toISOString(),
    });
    await this.ledger({
      profileId: existing.client_id,
      direction: 'debit',
      kind: 'escrow_hold',
      amount,
      title: `Escrow hold — ${(jobTitle as string) ?? 'job'}`,
      jobId: existing.job_id,
    });
    return { escrow: revived, placed: true };
  }

  /**
   * Undoes a hold placed for a hire that then failed to go through. Distinct
   * from `cancelForJob` only in the ledger line the client reads: nothing
   * about their job was cancelled, the hire simply did not complete.
   */
  async releaseHoldForFailedHire(jobId: string): Promise<void> {
    const escrow = await this.findByJob(jobId);
    if (!escrow || escrow.status !== 'held') return;
    // Quietly, not `settle`: if something else already moved this escrow on,
    // the money is no longer where this rollback thought it was, and the only
    // thing left to get wrong is crediting the client for it twice.
    const cancelled = await this.settleIfUnchanged(escrow, {
      status: 'cancelled',
    });
    if (!cancelled) return;
    await this.creditClient(escrow, 'Refund — hire did not complete');
  }

  /**
   * Called when the client completes the job: pay the provider.
   *
   * Raises rather than returning null when there is nothing to release. This
   * used to no-op silently, which was safe only because `JobsService.complete`
   * blocks a second completion on job status before ever reaching here — the
   * guard that actually produces the user-facing "already completed" error. A
   * silent no-op is the wrong contract for a money mover: any second call site
   * (a retried webhook, a payout rail) would read success and believe a
   * provider had been paid twice over.
   *
   * A job that never had a budget is the one absence that is not an error —
   * every job posted before migration 0007 has none, and there is genuinely
   * nothing to move. `releaseIfHeld` is the caller-facing wrapper that keeps
   * that distinction; see `JobsService.complete`.
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
   *
   * This is what the job lifecycle calls. `release` is for callers that know
   * a live hold must exist and want to hear about it when one does not.
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
   */
  async cancelForJob(jobId: string): Promise<EscrowRow | null> {
    const escrow = await this.findByJob(jobId);
    // Already released, refunded, cancelled, or frozen for an admin. Unlike
    // `release` this stays quiet rather than raising: cancelling a job whose
    // money has already gone back is the outcome the caller wanted, and there
    // is nothing left to do about it.
    if (!escrow || escrow.status !== 'held') return null;

    // Conditional, and quiet when it loses. A client tapping Cancel while the
    // provider taps Decline is two different endpoints reaching this with the
    // same escrow: both read 'held', and without the re-assertion both would
    // credit the client, refunding one hold twice and inventing the money for
    // the second one.
    const updated = await this.settleIfUnchanged(escrow, {
      status: 'cancelled',
    });
    if (!updated) return null;
    await this.creditClient(escrow, 'Refund — job cancelled');
    return updated;
  }

  /**
   * Job completed, or a dispute resolved in the provider's favour.
   *
   * This is the only place the platform takes a cut. The rate is read now,
   * at release, and then frozen onto the escrow row — reading the live setting
   * later to explain an old payout would misreport every job that settled
   * under a different rate. The default rate is 0, so until an admin sets one
   * this behaves exactly as it did before commission existed.
   */
  async payOut(escrow: EscrowRow): Promise<EscrowRow> {
    // Re-asserted in the WHERE clause below rather than only checked here:
    // two concurrent releases both read 'held', and only the update that
    // actually flips the row may credit the provider.
    if (escrow.status !== 'held' && escrow.status !== 'disputed') {
      throw new ConflictException(
        `Escrow is already '${escrow.status}' — cannot pay it out.`,
      );
    }
    const amount = Number(escrow.amount);
    const commission = round2(amount * (await this.commissionRate()));
    const updated = await this.settle(escrow, {
      status: 'released',
      released_at: new Date().toISOString(),
      commission_amount: commission,
    });
    await this.creditProvider(escrow, round2(amount - commission), commission);
    return updated;
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

  /** Dispute resolved in the client's favour — return the held funds. */
  async refund(escrow: EscrowRow): Promise<EscrowRow> {
    if (escrow.status !== 'held' && escrow.status !== 'disputed') {
      throw new ConflictException(
        `Escrow is already '${escrow.status}' — cannot refund it.`,
      );
    }
    const updated = await this.settle(escrow, {
      status: 'refunded',
      refunded_at: new Date().toISOString(),
    });
    await this.creditClient(escrow, 'Refund — dispute resolved');
    return updated;
  }

  async markDisputed(escrowId: string): Promise<EscrowRow> {
    return this.setStatus(escrowId, { status: 'disputed' });
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
   * A terminal status change that is about to move money, applied only if the
   * row is still in the status we read. Two admins resolving the same dispute
   * — or a release racing a webhook retry — both pass the in-memory guard;
   * this is what makes exactly one of them win, so the provider is credited
   * once rather than once per caller.
   */
  private async settle(
    escrow: EscrowRow,
    patch: Record<string, unknown>,
  ): Promise<EscrowRow> {
    const updated = await this.settleIfUnchanged(escrow, patch);
    if (!updated) {
      throw new ConflictException(
        'This escrow was already settled by someone else.',
      );
    }
    return updated;
  }

  /**
   * The same conditional update, returning null instead of raising when it
   * loses. For the callers whose whole job is to end up in a state someone
   * else may already have reached — cancelling, and rolling a failed hire
   * back. Losing there is not an error; crediting the client anyway is.
   */
  private async settleIfUnchanged(
    escrow: EscrowRow,
    patch: Record<string, unknown>,
  ): Promise<EscrowRow | null> {
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .update(patch)
      .eq('id', escrow.id)
      .eq('status', escrow.status)
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return (data as EscrowRow) ?? null;
  }

  private async setStatus(
    escrowId: string,
    patch: Record<string, unknown>,
  ): Promise<EscrowRow> {
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .update(patch)
      .eq('id', escrowId)
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data as EscrowRow;
  }

  /**
   * The provider's payout — net of commission, and the one ledger row admin
   * analytics counts as gross transaction value (`kind = 'payout'`).
   *
   * The commission itself deliberately gets no ledger row. `wallet_transactions`
   * is keyed by profile and the platform is not a profile; the withheld amount
   * is recorded on the escrow row instead, which is where the admin console
   * sums it. The ledger therefore no longer nets to zero across a released
   * job — the shortfall is exactly the commission, which is the correct
   * statement that the money left user wallets and did not arrive in another.
   */
  private async creditProvider(
    escrow: EscrowRow,
    netAmount: number,
    commission: number,
  ) {
    const title = await this.jobTitle(escrow.job_id);
    await this.ledger({
      profileId: escrow.provider_id,
      direction: 'credit',
      kind: 'payout',
      amount: netAmount,
      title:
        commission > 0
          ? `Payout — ${title} (less ${commission.toFixed(2)} platform fee)`
          : `Payout — ${title}`,
      jobId: escrow.job_id,
    });
  }

  /**
   * Returns held funds to the client. Tagged `refund`, not `payout` — this is a
   * credit carrying a job_id, and counting it as revenue would inflate the
   * dashboard by the value of every cancelled or disputed job.
   */
  private async creditClient(escrow: EscrowRow, reason: string) {
    const title = await this.jobTitle(escrow.job_id);
    await this.ledger({
      profileId: escrow.client_id,
      direction: 'credit',
      kind: 'refund',
      amount: Number(escrow.amount),
      title: `${reason}: ${title}`,
      jobId: escrow.job_id,
    });
  }

  private async jobTitle(jobId: string): Promise<string> {
    const { data } = await this.supabase.admin
      .from('jobs')
      .select('title')
      .eq('id', jobId)
      .maybeSingle();
    return (data?.title as string) ?? 'job';
  }

  private async ledger(entry: {
    profileId: string;
    direction: 'credit' | 'debit';
    kind: 'escrow_hold' | 'payout' | 'refund';
    amount: number;
    title: string;
    jobId: string;
  }) {
    const { error } = await this.supabase.admin
      .from('wallet_transactions')
      .insert({
        profile_id: entry.profileId,
        direction: entry.direction,
        kind: entry.kind,
        status: 'completed',
        amount: entry.amount,
        title: entry.title,
        job_id: entry.jobId,
      });
    // A silent failure here would desync the ledger from escrow state, which is
    // exactly the thing this table exists to record.
    if (error) throw new BadRequestException(error.message);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function peso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
