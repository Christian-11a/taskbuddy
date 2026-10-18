import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EscrowService } from '../escrow/escrow.service';
import type { Profile } from '../common/types';
import {
  PAYOUT_BANKS,
  WALLET_CHANNELS,
  type LinkPayoutAccountDto,
} from './payout-account.dto';

/**
 * The GCash, Maya or bank account a provider's payouts are sent to
 * (migrations 0056, 0058). Payouts go out through Xendit's sandbox (simulated
 * when Xendit is not configured), so no real money moves.
 */
@Injectable()
export class PayoutAccountsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly escrow: EscrowService,
  ) {}

  async get(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('linked_payout_accounts')
      .select('method, bank_name, account_name, account_number, updated_at')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data ? masked(data) : null;
  }

  async link(user: Profile, dto: LinkPayoutAccountDto) {
    const { data, error } = await this.supabase.admin
      .from('linked_payout_accounts')
      .upsert({
        profile_id: user.id,
        method: dto.method,
        bank_name: dto.method === 'bank' ? PAYOUT_BANKS[dto.bank_code!] : null,
        channel_code:
          dto.method === 'bank' ? dto.bank_code! : WALLET_CHANNELS[dto.method],
        account_name: dto.account_name.trim(),
        account_number: dto.account_number,
        updated_at: new Date().toISOString(),
      })
      .select('method, bank_name, account_name, account_number, updated_at')
      .single();
    if (error) throw new BadRequestException(error.message);
    // Payouts that were waiting for an account go out now.
    await this.escrow.passThrough([user.id]);
    return masked(data);
  }

  /** The banks a payout can go to, for the app's picker. */
  banks() {
    return Object.entries(PAYOUT_BANKS).map(([code, name]) => ({ code, name }));
  }

  async unlink(user: Profile) {
    const { error } = await this.supabase.admin
      .from('linked_payout_accounts')
      .delete()
      .eq('profile_id', user.id);
    if (error) throw new BadRequestException(error.message);
    return { removed: true };
  }

  /** Payments in and out, newest first: the statement that replaced the wallet. */
  async history(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('wallet_transactions')
      .select(
        'id, direction, kind, amount, title, status, withdrawal_destination, review_note, job_id, created_at',
      )
      .eq('profile_id', user.id)
      .neq('title', 'Prototype wallet retired')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new BadRequestException(error.message);
    const rows = data ?? [];

    // Payout rows carry the platform fee withheld at release, taken from the
    // escrow of the same job. Other rows (top-ups, withdrawals) get null.
    const jobIds = [
      ...new Set(
        rows
          .filter((r) => r.kind === 'payout' && r.job_id)
          .map((r) => r.job_id as string),
      ),
    ];
    const commissions = new Map<string, number>();
    if (jobIds.length > 0) {
      const { data: escrows, error: escrowError } = await this.supabase.admin
        .from('escrow_transactions')
        .select('job_id, commission_amount')
        .in('job_id', jobIds);
      if (escrowError) throw new BadRequestException(escrowError.message);
      for (const e of escrows ?? []) {
        commissions.set(e.job_id as string, Number(e.commission_amount ?? 0));
      }
    }
    return rows.map((r) => ({
      ...r,
      commission_amount:
        r.kind === 'payout' && r.job_id
          ? (commissions.get(r.job_id as string) ?? 0)
          : null,
    }));
  }
}

/** Only the last four digits ever leave the server. */
function masked(row: {
  method: string;
  bank_name: string | null;
  account_name: string;
  account_number: string;
  updated_at: string;
}) {
  const { account_number, ...rest } = row;
  return { ...rest, account_last4: account_number.slice(-4) };
}
