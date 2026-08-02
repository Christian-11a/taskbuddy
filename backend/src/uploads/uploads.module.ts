import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  // Jobs and verifications resolve storage paths to URLs through this service.
  exports: [UploadsService],
})
export class UploadsModule {}
