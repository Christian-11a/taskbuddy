import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsString, Max, Min } from 'class-validator';

/**
 * Bounds are in pesos.
 *
 * The floor is Stripe's own minimum charge for PHP — anything under it is
 * rejected by the API, so catching it here turns a confusing gateway error
 * into a validation message. The ceiling is a blast-radius limit, not a
 * product rule: this is a marketplace wallet for home services, and a
 * six-figure top-up is a mistake or a test of our fraud handling.
 */
export const MIN_TOPUP_PHP = 20;
export const MAX_TOPUP_PHP = 100_000;

export class CreateTopupDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(MIN_TOPUP_PHP)
  @Max(MAX_TOPUP_PHP)
  @Type(() => Number)
  amount!: number;
}

/**
 * A top-up run through Stripe's hosted Checkout page instead of PaymentSheet.
 *
 * `app_redirect` is where the browser is sent once Stripe is done. Stripe only
 * accepts http(s) in `success_url`, so it never receives this value directly —
 * it points at /payments/return, which bounces to the deep link (see the
 * controller). The URI is checked against the same allowlist as the Google
 * flow before we agree to redirect anyone to it.
 */
export class CreateCheckoutSessionDto extends CreateTopupDto {
  @IsString()
  app_redirect!: string;
}
