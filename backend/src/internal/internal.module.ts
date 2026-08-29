import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { PushModule } from '../push/push.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';

/**
 * Imports the two modules rather than re-providing their schedulers, so the
 * instances behind /internal/tick/* are the same singletons the `@Cron`
 * decorators run on — including their `running` re-entrancy flags, which is
 * what stops an HTTP tick and a scheduled tick from overlapping.
 */
@Module({
  imports: [PushModule, RecommendationsModule],
  controllers: [InternalController],
})
export class InternalModule {}
