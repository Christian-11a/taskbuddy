import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService],
  // EscrowService checks the client's balance before holding funds.
  exports: [WalletService],
})
export class WalletModule {}
