import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { AdminActionsModule } from '../admin/admin-actions.module';

/**
 * Escrow lifecycle (migration 0009). JobsModule and ApplicationsModule drive it
 * from the job lifecycle; AdminModule owns the review queues.
 */
@Module({
  // No WalletModule: balance checks happen inside escrow_place_hold (0028),
  // under the same lock as the debit they guard.
  imports: [AdminActionsModule],
  controllers: [DisputesController],
  providers: [EscrowService, DisputesService],
  exports: [EscrowService, DisputesService],
})
export class EscrowModule {}
