import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { AdminActionsModule } from '../admin/admin-actions.module';

@Module({
  // Issuing a recovery credit is the one thing this service does that mints
  // balance, so it writes to the audit trail. AdminActionsModule is the
  // standalone half of admin/ precisely so importing it here is not a cycle.
  imports: [AdminActionsModule],
  controllers: [WalletController],
  providers: [WalletService],
  // EscrowService checks the client's balance before holding funds.
  exports: [WalletService],
})
export class WalletModule {}
