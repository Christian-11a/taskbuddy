import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeModule } from './stripe.module';
import { VerificationsModule } from '../verifications/verifications.module';

@Module({
  // VerificationsModule: the same webhook endpoint receives Stripe Identity
  // results, which are applied through VerificationsService.
  imports: [StripeModule, VerificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
