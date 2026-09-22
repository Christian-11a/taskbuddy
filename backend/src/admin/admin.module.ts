import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminPlatformService } from './admin-platform.service';
import { AdminActionsModule } from './admin-actions.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { SkillRequestsModule } from '../skill-requests/skill-requests.module';
import { EscrowModule } from '../escrow/escrow.module';
import { ChatModule } from '../chat/chat.module';
import { WalletModule } from '../wallet/wallet.module';
import { ConnectModule } from '../payments/connect/connect.module';

@Module({
  imports: [
    AdminActionsModule,
    VerificationsModule,
    SkillRequestsModule,
    EscrowModule,
    ChatModule,
    WalletModule,
    ConnectModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminPlatformService],
})
export class AdminModule {}
