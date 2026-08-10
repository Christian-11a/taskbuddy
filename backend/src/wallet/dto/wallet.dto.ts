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
} from 'class-validator';
import type { WalletTxnDirection } from '../../common/types';

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
