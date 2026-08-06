import { Module } from '@nestjs/common';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';
import { UploadsModule } from '../uploads/uploads.module';
import { StripeModule } from '../payments/stripe.module';
import { AdminActionsModule } from '../admin/admin-actions.module';

@Module({
  imports: [UploadsModule, StripeModule, AdminActionsModule],
  controllers: [VerificationsController],
  providers: [VerificationsService],
  // AdminModule owns the review queue endpoints and delegates to this service.
  exports: [VerificationsService],
})
export class VerificationsModule {}
