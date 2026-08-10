import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminActionsModule } from './admin-actions.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { EscrowModule } from '../escrow/escrow.module';
import { ChatModule } from '../chat/chat.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    AdminActionsModule,
    VerificationsModule,
    EscrowModule,
    ChatModule,
    WalletModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
