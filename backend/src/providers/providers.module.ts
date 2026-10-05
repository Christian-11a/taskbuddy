import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { ProvidersController } from './providers.controller';

@Module({
  imports: [UploadsModule],
  controllers: [ProvidersController, PortfolioController],
  providers: [PortfolioService],
})
export class ProvidersModule {}
