import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EscrowService } from '../escrow/escrow.service';
import type { Profile } from '../common/types';
import type { LinkPayoutAccountDto } from './payout-account.dto';

/**
 * The GCash, Maya or bank account a provider's payouts are sent to
 * (migration 0056). This is a prototype: a payout is recorded as sent to
 * this account with a simulated reference, and no money moves.
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
        bank_name: dto.method === 'bank' ? dto.bank_name!.trim() : null,
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
    return data;
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
