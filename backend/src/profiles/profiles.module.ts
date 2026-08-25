import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { UploadsModule } from '../uploads/uploads.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  // WalletModule: account deletion refuses while the ledger still has a
  // balance, so it needs the same derived balance escrow uses.
  imports: [UploadsModule, WalletModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
