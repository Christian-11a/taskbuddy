import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { PaymentsScheduler } from './payments.scheduler';
import { AdminActionsModule } from '../admin/admin-actions.module';
import { ConnectModule } from '../payments/connect/connect.module';

/**
 * Escrow lifecycle (migration 0009). JobsModule and ApplicationsModule drive it
 * from the job lifecycle; AdminModule owns the review queues.
 */
@Module({
  // No WalletModule: balance checks happen inside escrow_place_hold (0028),
  // under the same lock as the debit they guard.
  // ConnectModule: a released card-funded escrow is sent on to the provider's
  // Stripe account (§29.5). ConnectModule depends only on Stripe and the audit
  // log, so this is not a cycle.
  imports: [AdminActionsModule, ConnectModule],
  controllers: [DisputesController],
  providers: [EscrowService, DisputesService, PaymentsScheduler],
  exports: [EscrowService, DisputesService, PaymentsScheduler],
})
export class EscrowModule {}
