import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreateWalletTxnDto,
  ListWalletTxnQueryDto,
  ListWithdrawalsQueryDto,
  RequestWithdrawalDto,
} from './dto/wallet.dto';
import type { Profile } from '../common/types';

const ADMIN_WALLET_SELECT =
  '*, profile:profiles!wallet_transactions_profile_id_fkey(id, full_name)';

export interface WalletTransaction {
  id: string;
  profile_id: string;
  direction: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'failed';
  kind: string;
  amount: number;
  title: string;
  job_id: string | null;
  withdrawal_destination: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
}

@Injectable()
export class WalletService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Wallet overview: derived balance, summary stats, and the transaction list. */
  async overview(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);

    const transactions = (data ?? []) as WalletTransaction[];

    // Balance and stats are derived from the ledger — nothing is stored.
    let balance = 0;
    let totalCredited = 0;
    let totalDebited = 0;
    let pending = 0;
    let pendingWithdrawals = 0;
    for (const t of transactions) {
      const amount = Number(t.amount);
      if (t.status === 'pending') {
        pending += amount;
        if (t.direction === 'debit') pendingWithdrawals += amount;
        continue;
      }
      if (t.status !== 'completed') continue;
      if (t.direction === 'credit') {
        balance += amount;
        totalCredited += amount;
      } else {
        balance -= amount;
        totalDebited += amount;
      }
    }

    return {
      balance: round2(balance),
      /**
       * What the user can actually commit right now. A withdrawal awaiting an
       * admin has not left the ledger yet, but it is spoken for — counting it
       * as spendable would let the same peso fund a hire and a payout.
       */
      available: round2(balance - pendingWithdrawals),
      total_credited: round2(totalCredited),
      total_debited: round2(totalDebited),
      pending: round2(pending),
      pending_withdrawals: round2(pendingWithdrawals),
      transactions,
    };
  }

  /**
   * Files a withdrawal request. The row lands `pending` and stays there until
   * an admin settles it — see `settleWithdrawal` / `rejectWithdrawal`.
   *
   * Why pending rather than completed, which is what this used to write: there
   * is no payout rail. Money enters the platform through exactly one door (a
   * Stripe webhook reporting a settled charge) and, until Stripe Connect or a
   * local disbursement provider exists, leaves through none. A ledger row
   * saying `completed` asserted that money had moved when nothing had, so the
   * balance was wrong the moment anyone pressed the button.
   *
   * `kind` is derived here and deliberately not accepted from the client: a
   * caller who could set `kind = 'payout'` could inflate platform revenue on
   * the admin dashboard. Escrow writes its own rows (see EscrowService) and is
   * the only thing that can create a payout.
   */
  async requestWithdrawal(user: Profile, dto: RequestWithdrawalDto) {
    const available = await this.availableBalanceFor(user.id);
    if (available < dto.amount) {
      throw new BadRequestException(
        `Insufficient wallet balance: ${dto.amount} requested, ${available} available`,
      );
    }

    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .insert({
        profile_id: user.id,
        direction: 'debit',
        kind: 'withdrawal',
        amount: dto.amount,
        title: dto.title ?? 'Withdrawal',
        withdrawal_destination: dto.destination,
        status: 'pending',
      })
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * The pre-0023 entry point, kept working for clients built against it.
   *
   * Credits are refused. This endpoint used to accept them, back when there
   * was no payment gateway — which meant any authenticated caller could mint
   * balance for free, and balance buys real labour through escrow (§18).
   * Nothing a client says can add money.
   *
   * @deprecated Use `requestWithdrawal` / `POST /wallet/withdrawals`.
   */
  async create(user: Profile, dto: CreateWalletTxnDto) {
    if (dto.direction === 'credit') {
      throw new BadRequestException(
        'Wallet top-ups must go through Stripe: POST /payments/checkout-session',
      );
    }
    return this.requestWithdrawal(user, {
      amount: dto.amount,
      title: dto.title,
      // The old body had nowhere to say where the money should go. A request
      // that arrives without one still has to be settled by hand, so it is
      // recorded as unstated rather than rejected.
      destination:
        dto.destination ?? 'Not specified — contact the account holder',
    });
  }

  /** This user's own withdrawal requests, newest first. */
  async listWithdrawals(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .select('*')
      .eq('profile_id', user.id)
      .eq('kind', 'withdrawal')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * The user retracts a request an admin has not acted on. Marked `failed`
   * rather than deleted: the ledger records what was attempted, and a row that
   * disappears leaves the user's own history with a hole in it where they
   * remember pressing a button.
   */
  async cancelWithdrawal(user: Profile, id: string) {
    const row = await this.findWithdrawal(id);
    if (row.profile_id !== user.id) {
      throw new ForbiddenException('Not your withdrawal request');
    }
    if (row.status !== 'pending') {
      throw new BadRequestException(
        `This withdrawal is already '${row.status}'`,
      );
    }
    return this.setWithdrawalStatus(id, 'failed', {
      review_note: 'Cancelled by the account holder',
    });
  }

  /**
   * An admin has actually sent the money and is recording that fact. The row
   * flips to `completed`, which is the point at which the balance drops — up
   * to here the amount was only reserved.
   */
  async settleWithdrawal(admin: Profile, id: string, reference?: string) {
    const row = await this.findWithdrawal(id);
    if (row.status !== 'pending') {
      throw new BadRequestException(
        `This withdrawal is already '${row.status}'`,
      );
    }
    // Re-checked at settlement, not just at request time: escrow may have
    // spent the balance in between, and paying out money that is no longer
    // there would drive the ledger negative.
    const settled = await this.balanceFor(row.profile_id);
    if (settled < Number(row.amount)) {
      throw new BadRequestException(
        `Balance no longer covers this withdrawal: ${row.amount} requested, ${settled} available`,
      );
    }
    const settledRow = await this.setWithdrawalStatus(id, 'completed', {
      reviewed_by: admin.id,
      review_note: reference ?? null,
    });
    await this.notify(
      row.profile_id,
      'Withdrawal sent',
      reference
        ? `Your withdrawal of ${row.amount} has been sent. Reference: ${reference}`
        : `Your withdrawal of ${row.amount} has been sent.`,
    );
    return settledRow;
  }

  /** An admin refuses it. The reason reaches the account holder. */
  async rejectWithdrawal(admin: Profile, id: string, reason: string) {
    const row = await this.findWithdrawal(id);
    if (row.status !== 'pending') {
      throw new BadRequestException(
        `This withdrawal is already '${row.status}'`,
      );
    }
    const rejected = await this.setWithdrawalStatus(id, 'failed', {
      reviewed_by: admin.id,
      review_note: reason,
    });
    await this.notify(
      row.profile_id,
      'Withdrawal declined',
      `Your withdrawal of ${row.amount} was not processed: ${reason}. The amount is back in your available balance.`,
    );
    return rejected;
  }

  /** The admin settlement queue — pending first, oldest first within it. */
  async listWithdrawalsForAdmin(query: ListWithdrawalsQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const status = query.status ?? 'pending';
    const { data, error, count } = await this.supabase.admin
      .from('wallet_transactions')
      .select(ADMIN_WALLET_SELECT, { count: 'exact' })
      .eq('kind', 'withdrawal')
      .eq('status', status)
      // Oldest first: this is a work queue, and the person who has been
      // waiting longest should be at the top of it.
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new BadRequestException(error.message);
    return { withdrawals: data ?? [], total: count ?? 0 };
  }

  /**
   * Every wallet ledger row platform-wide, for the admin console's "Wallet"
   * tab (Transactions page) — distinct from escrow, which is money held for
   * one job (see EscrowService.listForAdmin). This is the only place a top-up
   * from Stripe Checkout (PR #35) becomes visible outside Stripe's own
   * dashboard.
   */
  async listForAdmin(query: ListWalletTxnQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    let builder = this.supabase.admin
      .from('wallet_transactions')
      .select(ADMIN_WALLET_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.direction) builder = builder.eq('direction', query.direction);
    if (query.kind) builder = builder.eq('kind', query.kind);
    if (query.status) builder = builder.eq('status', query.status);

    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);
    return { transactions: data ?? [], total: count ?? 0 };
  }

  /** Derived balance: completed credits minus completed debits. */
  async balanceFor(profileId: string): Promise<number> {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .select('direction, amount')
      .eq('profile_id', profileId)
      .eq('status', 'completed');
    if (error) throw new BadRequestException(error.message);

    return round2(
      (data ?? []).reduce(
        (sum, t) =>
          t.direction === 'credit'
            ? sum + Number(t.amount)
            : sum - Number(t.amount),
        0,
      ),
    );
  }

  /**
   * The settled balance minus anything already promised to a pending
   * withdrawal.
   *
   * This — not `balanceFor` — is what may be committed to something new,
   * which is why escrow holds check it. Without the reservation, a user could
   * file a withdrawal for their whole balance and immediately hire someone
   * with the same money; whichever of the two settled second would take the
   * ledger negative.
   */
  async availableBalanceFor(profileId: string): Promise<number> {
    const [settled, reserved] = await Promise.all([
      this.balanceFor(profileId),
      this.pendingWithdrawalTotal(profileId),
    ]);
    return round2(settled - reserved);
  }

  private async pendingWithdrawalTotal(profileId: string): Promise<number> {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .select('amount')
      .eq('profile_id', profileId)
      .eq('kind', 'withdrawal')
      .eq('status', 'pending');
    if (error) throw new BadRequestException(error.message);
    return round2((data ?? []).reduce((sum, t) => sum + Number(t.amount), 0));
  }

  /**
   * Tells the account holder what happened to their money. Best-effort: a
   * notification that fails to write must not undo a settlement that already
   * happened, and the ledger row itself remains the record either way.
   */
  private async notify(recipientId: string, title: string, body: string) {
    await this.supabase.admin.from('notifications').insert({
      recipient_id: recipientId,
      type: 'wallet_update',
      title,
      body,
    });
  }

  private async findWithdrawal(id: string): Promise<WalletTransaction> {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .select('*')
      .eq('id', id)
      .eq('kind', 'withdrawal')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Withdrawal request not found');
    return data;
  }

  private async setWithdrawalStatus(
    id: string,
    status: 'completed' | 'failed',
    patch: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .update({ ...patch, status, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      // Re-asserted in the WHERE clause, so two admins clicking at once
      // produce one settlement and one "already settled", not two payouts.
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new BadRequestException(
        'This withdrawal was already settled by someone else',
      );
    }
    return data;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
