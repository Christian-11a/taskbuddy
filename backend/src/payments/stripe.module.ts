import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

/**
 * Separate from PaymentsModule so verifications can reach Stripe (for Identity)
 * without importing payments, which imports verifications to apply Identity
 * results — a cycle Nest would refuse to resolve.
 */
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
