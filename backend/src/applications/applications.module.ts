import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { EscrowModule } from '../escrow/escrow.module';

@Module({
  imports: [EscrowModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  // The card-at-hire webhook (PaymentsModule) finishes a hire through the
  // same accept path, and checks hireability with the same rules.
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
