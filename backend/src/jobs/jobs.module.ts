import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { UploadsModule } from '../uploads/uploads.module';
import { EscrowModule } from '../escrow/escrow.module';

@Module({
  imports: [UploadsModule, EscrowModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
