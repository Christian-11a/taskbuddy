import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { HireFundingService } from './hire-funding.service';
import { StripeModule } from './stripe.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { ApplicationsModule } from '../applications/applications.module';
import { EscrowModule } from '../escrow/escrow.module';

@Module({
  // VerificationsModule: the same webhook endpoint receives Stripe Identity
  // results, which are applied through VerificationsService.
  // ApplicationsModule + EscrowModule: a card-at-hire payment is turned into
  // a hold and a hire by the same services a wallet accept uses (§29.4).
  imports: [
    StripeModule,
    VerificationsModule,
    ApplicationsModule,
    EscrowModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, HireFundingService],
})
export class PaymentsModule {}
