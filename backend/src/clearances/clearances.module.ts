import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import {
  AdminClearancesController,
  ClearancesController,
} from './clearances.controller';
import { ClearancesService } from './clearances.service';

@Module({
  imports: [UploadsModule],
  controllers: [ClearancesController, AdminClearancesController],
  providers: [ClearancesService],
  exports: [ClearancesService],
})
export class ClearancesModule {}
