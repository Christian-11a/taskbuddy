import { Type } from 'class-transformer';
import { IsNumber, IsPositive, Max, Min } from 'class-validator';

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
