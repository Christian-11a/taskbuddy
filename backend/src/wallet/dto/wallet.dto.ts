import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import type { WalletTxnDirection } from '../../common/types';

/**
 * A user asking for money to leave the platform.
 *
 * `direction` and `kind` are absent on purpose: there is exactly one thing
 * this endpoint can do. The old shape took a free `direction`, which made
 * "withdraw" and "mint yourself balance" the same request with one word
 * changed.
 */
export class RequestWithdrawalDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount!: number;

  /**
   * Where to send it, in the user's own words — a GCash number, a bank
   * account. Free text because a human settles it by reading it; there is no
   * disbursement rail to validate against yet.
   */
  @IsString()
  @Length(1, 200)
  destination!: string;

  /** What the row is called in the ledger. Defaults to 'Withdrawal'. */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;
}

/**
 * The pre-0023 body. Kept so `POST /wallet/transactions` does not break under
 * clients built against it, but it now produces the same pending request as
 * `POST /wallet/withdrawals` rather than a completed ledger row.
 *
 * @deprecated Use {@link RequestWithdrawalDto} against `POST /wallet/withdrawals`.
 */
export class CreateWalletTxnDto {
  @IsIn(['credit', 'debit'])
  direction!: WalletTxnDirection;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount!: number;

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsOptional()
  @IsUUID()
  job_id?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  destination?: string;
}

export class ListWalletTxnQueryDto {
  @IsOptional()
  @IsIn(['credit', 'debit'])
  direction?: WalletTxnDirection;

  @IsOptional()
  @IsIn([
    'topup',
    'withdrawal',
    'escrow_hold',
    'payout',
    'refund',
    'adjustment',
  ])
  kind?: string;

  @IsOptional()
  @IsIn(['pending', 'completed', 'failed'])
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;
}

/** The admin settlement queue's filter — pending by default. */
export class ListWithdrawalsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'completed', 'failed'])
  status?: 'pending' | 'completed' | 'failed';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;
}

/**
 * An admin settling a withdrawal by hand.
 *
 * `reference` is required on approval and rejected on refusal, and vice versa
 * for `reason` — the controller enforces which one applies. Both are shown to
 * the account holder, so neither is a place for internal shorthand.
 */
export class SettleWithdrawalDto {
  /** Payout reference from whatever rail actually moved the money. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reference?: string;
}

export class RejectWithdrawalDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}
