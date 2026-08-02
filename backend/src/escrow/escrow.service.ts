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
}

const TRANSACTION_SELECT =
  '*, jobs(title, service_categories(name)), ' +
  'client:profiles!escrow_transactions_client_id_fkey(id, full_name), ' +
  'provider:profiles!escrow_transactions_provider_id_fkey(id, full_name)';

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
    const balance = await this.wallet.balanceFor(job.client_id as string);
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

  /** Job completed, or a dispute resolved in the provider's favour. */
  async payOut(escrow: EscrowRow): Promise<EscrowRow> {
    const updated = await this.setStatus(escrow.id, {
      status: 'released',
      released_at: new Date().toISOString(),
    });
    await this.creditProvider(escrow);
    return updated;
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
   * which is the shape the console renders; it filters and searches client-side.
   */
  async listForAdmin(query: ListTransactionsQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    let builder = this.supabase.admin
      .from('escrow_transactions')
      .select(TRANSACTION_SELECT, { count: 'exact' })
      .order('held_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.status) builder = builder.eq('status', query.status);

    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);
    return { transactions: data ?? [], total: count ?? 0 };
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
   * The provider's payout — the one ledger row admin analytics counts as
   * platform revenue (`kind = 'payout'`).
   */
  private async creditProvider(escrow: EscrowRow) {
    const title = await this.jobTitle(escrow.job_id);
    await this.ledger({
      profileId: escrow.provider_id,
      direction: 'credit',
      kind: 'payout',
      amount: Number(escrow.amount),
      title: `Payout — ${title}`,
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

function peso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
