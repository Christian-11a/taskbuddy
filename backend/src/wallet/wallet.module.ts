import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { AdminActionsModule } from '../admin/admin-actions.module';

/**
 * The internal ledger behind escrow. There is no user-facing wallet any more
 * (migration 0056): payments and payouts are listed by GET /payouts/history,
 * and the admin console keeps its read and recovery tools.
 */
@Module({
  // Issuing a recovery credit is the one thing this service does that mints
  // balance, so it writes to the audit trail. AdminActionsModule is the
  // standalone half of admin/ precisely so importing it here is not a cycle.
  imports: [AdminActionsModule],
  providers: [WalletService],
  // EscrowService checks the client's balance before holding funds.
  exports: [WalletService],
})
export class WalletModule {}
