import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateWalletTxnDto } from './dto/wallet.dto';
import type { Profile } from '../common/types';

export interface WalletTransaction {
  id: string;
  profile_id: string;
  direction: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'failed';
  amount: number;
  title: string;
  job_id: string | null;
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
    for (const t of transactions) {
      const amount = Number(t.amount);
      if (t.status === 'pending') {
        pending += amount;
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
      total_credited: round2(totalCredited),
      total_debited: round2(totalDebited),
      pending: round2(pending),
      transactions,
    };
  }

  /**
   * Records a user-initiated withdrawal.
   *
   * Credits are refused. This endpoint used to accept them, back when there was
   * no payment gateway — which meant any authenticated caller could mint
   * balance for free, and balance buys real labour through escrow (§18). Wallet
   * funding now has exactly one entry point: a Stripe webhook reporting a
   * charge that actually settled (see PaymentsService). Nothing a client says
   * can add money.
   *
   * `kind` is derived here and deliberately not accepted from the client: a
   * caller who could set `kind = 'payout'` could inflate platform revenue on the
   * admin dashboard. Escrow writes its own rows (see EscrowService) and is the
   * only thing that can create a payout.
   */
  async create(user: Profile, dto: CreateWalletTxnDto) {
    if (dto.direction === 'credit') {
      throw new BadRequestException(
        'Wallet top-ups must go through Stripe: POST /payments/checkout-session',
      );
    }
    const kind = 'withdrawal';

    const balance = await this.balanceFor(user.id);
    if (balance < dto.amount) {
      throw new BadRequestException(
        `Insufficient wallet balance: ${dto.amount} requested, ${balance} available`,
      );
    }

    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .insert({
        profile_id: user.id,
        direction: dto.direction,
        kind,
        amount: dto.amount,
        title: dto.title,
        job_id: dto.job_id ?? null,
        status: 'completed',
      })
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
