import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeEventsService } from './stripe-events.service';

/**
 * Separate from PaymentsModule so verifications can reach Stripe (for Identity)
 * without importing payments, which imports verifications to apply Identity
 * results — a cycle Nest would refuse to resolve. The Connect module leans on
 * the same split for the same reason.
 */
@Module({
  providers: [StripeService, StripeEventsService],
  exports: [StripeService, StripeEventsService],
})
export class StripeModule {}
