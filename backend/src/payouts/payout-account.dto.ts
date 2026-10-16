import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';

export const PAYOUT_METHODS = ['gcash', 'maya', 'bank'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/**
 * Banks a payout can go to, by Xendit channel code. Check new codes against
 * Xendit's Philippine payout channel list before adding them.
 */
export const PAYOUT_BANKS: Record<string, string> = {
  PH_BPI: 'BPI',
  PH_BDO: 'BDO',
  PH_UBP: 'UnionBank',
  PH_MET: 'Metrobank',
  PH_LBP: 'Landbank',
  PH_SEC: 'Security Bank',
  PH_RCBC: 'RCBC',
  PH_CBC: 'China Bank',
};

/** The Xendit channel a GCash or Maya payout goes to. */
export const WALLET_CHANNELS: Record<'gcash' | 'maya', string> = {
  gcash: 'PH_GCASH',
  maya: 'PH_PAYMAYA',
};

/** `PUT /payouts/account` — where the provider's payouts are sent. */
export class LinkPayoutAccountDto {
  @IsIn(PAYOUT_METHODS)
  method!: PayoutMethod;

  /** Bank payouts only: one of PAYOUT_BANKS' channel codes. */
  @ValidateIf((dto: LinkPayoutAccountDto) => dto.method === 'bank')
  @IsIn(Object.keys(PAYOUT_BANKS))
  bank_code?: string;

  @IsString()
  @Length(2, 120)
  account_name!: string;

  /** Mobile number for GCash/Maya, account number for a bank. Digits only. */
  @Matches(/^[0-9]{6,20}$/, {
    message: 'Account number must be 6 to 20 digits',
  })
  account_number!: string;
}
