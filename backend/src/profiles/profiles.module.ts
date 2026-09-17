import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { UploadsModule } from '../uploads/uploads.module';
import { WalletModule } from '../wallet/wallet.module';
import { GeocodingModule } from '../geocoding/geocoding.module';

@Module({
  // WalletModule: account deletion refuses while the ledger still has a
  // balance, so it needs the same derived balance escrow uses.
  // GeocodingModule: a changed address is geocoded so the profile carries
  // verified coordinates — what makes a provider eligible for matching.
  imports: [UploadsModule, WalletModule, GeocodingModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
