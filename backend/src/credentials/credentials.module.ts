import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminActionsModule } from '../admin/admin-actions.module';
import {
  AdminCredentialsController,
  CredentialsController,
} from './credentials.controller';
import { CredentialsService } from './credentials.service';

@Module({
  imports: [UploadsModule, AdminActionsModule],
  controllers: [CredentialsController, AdminCredentialsController],
  providers: [CredentialsService],
})
export class CredentialsModule {}
