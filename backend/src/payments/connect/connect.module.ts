import { Module } from '@nestjs/common';
import { StripeModule } from '../stripe.module';
import { ConnectAccountsService } from './connect-accounts.service';
import { ConnectPayoutsService } from './connect-payouts.service';
import { AdminActionsModule } from '../../admin/admin-actions.module';
import { ConnectController } from './connect.controller';

/**
 * Stripe Connect Express payout accounts (BACKEND_SCHEMA.md §29).
 *
 * Depends only on StripeModule and the audit log, so escrow and admin can
 * import it — to send a payout on, or retry one — without a cycle through
 * payments.
 */
@Module({
  imports: [StripeModule, AdminActionsModule],
  controllers: [ConnectController],
  providers: [ConnectAccountsService, ConnectPayoutsService],
  exports: [ConnectAccountsService, ConnectPayoutsService],
})
export class ConnectModule {}
