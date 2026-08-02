import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { VerificationsModule } from '../verifications/verifications.module';
import { EscrowModule } from '../escrow/escrow.module';

@Module({
  imports: [VerificationsModule, EscrowModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
