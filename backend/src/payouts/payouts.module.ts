import { Module } from '@nestjs/common';
import { EscrowModule } from '../escrow/escrow.module';
import { PayoutsController } from './payouts.controller';
import { PayoutAccountsService } from './payout-accounts.service';

@Module({
  imports: [EscrowModule],
  controllers: [PayoutsController],
  providers: [PayoutAccountsService],
})
export class PayoutsModule {}
