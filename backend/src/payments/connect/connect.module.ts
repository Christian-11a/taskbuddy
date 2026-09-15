import { Module } from '@nestjs/common';
import { StripeModule } from '../stripe.module';
import { ConnectAccountsService } from './connect-accounts.service';
import { ConnectController } from './connect.controller';

/**
 * Stripe Connect Express payout accounts (BACKEND_SCHEMA.md §29).
 *
 * Depends only on StripeModule, so escrow and admin can import it to ask "is
 * this provider payable?" without a cycle through payments.
 */
@Module({
  imports: [StripeModule],
  controllers: [ConnectController],
  providers: [ConnectAccountsService],
  exports: [ConnectAccountsService],
})
export class ConnectModule {}
