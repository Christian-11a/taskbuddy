import { BadRequestException, Injectable } from '@nestjs/common';
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
   */
  async hold(jobId: string, providerId: string): Promise<EscrowRow | null> {
    const { data: job, error } = await this.supabase.admin
      .from('jobs')
      .select('id, title, budget, client_id')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!job || job.budget == null) return null;

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
    if (insertError?.code === '23505') return this.findByJob(jobId);
    if (insertError) throw new BadRequestException(insertError.message);

    await this.ledger({
      profileId: job.client_id as string,
      direction: 'debit',
      kind: 'escrow_hold',
      amount,
      title: `Escrow hold — ${job.title as string}`,
      jobId,
    });
    return data as EscrowRow;
  }

  /**
   * Called when the client completes the job: pay the provider.
   * A disputed escrow is deliberately left alone — an admin has to resolve it.
   */
  async release(jobId: string): Promise<EscrowRow | null> {
    const escrow = await this.findByJob(jobId);
    if (!escrow || escrow.status !== 'held') return null;
    return this.payOut(escrow);
  }

  /**
   * Called when a job is cancelled. The client was debited when the hold was
   * created, so cancelling has to give it back. Disputed escrows are left alone
   * for an admin to resolve.
   */
  async cancelForJob(jobId: string): Promise<EscrowRow | null> {
    const escrow = await this.findByJob(jobId);
    if (!escrow || escrow.status !== 'held') return null;
    const updated = await this.setStatus(escrow.id, { status: 'cancelled' });
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
    const amount = Number(escrow.amount);
    const commission = round2(amount * (await this.commissionRate()));
    const updated = await this.setStatus(escrow.id, {
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
    const updated = await this.setStatus(escrow.id, {
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
