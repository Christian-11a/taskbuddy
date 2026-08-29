import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsScheduler } from './recommendations.scheduler';

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService, RecommendationsScheduler],
  exports: [RecommendationsScheduler],
})
export class RecommendationsModule {}
