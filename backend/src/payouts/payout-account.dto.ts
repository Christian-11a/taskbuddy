import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';

export const PAYOUT_METHODS = ['gcash', 'maya', 'bank'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/** `PUT /payouts/account` — where the provider's payouts are sent. */
export class LinkPayoutAccountDto {
  @IsIn(PAYOUT_METHODS)
  method!: PayoutMethod;

  @ValidateIf((dto: LinkPayoutAccountDto) => dto.method === 'bank')
  @IsString()
  @Length(2, 80)
  bank_name?: string;

  @IsString()
  @Length(2, 120)
  account_name!: string;

  /** Mobile number for GCash/Maya, account number for a bank. Digits only. */
  @Matches(/^[0-9]{6,20}$/, {
    message: 'Account number must be 6 to 20 digits',
  })
  account_number!: string;
}
