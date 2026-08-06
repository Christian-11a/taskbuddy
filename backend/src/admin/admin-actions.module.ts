import { Module } from '@nestjs/common';
import { AdminActionsService } from './admin-actions.service';

/**
 * Split out from AdminModule so VerificationsModule and EscrowModule can write
 * to the audit trail without depending on AdminModule (which already depends
 * on them).
 */
@Module({
  providers: [AdminActionsService],
  exports: [AdminActionsService],
})
export class AdminActionsModule {}
