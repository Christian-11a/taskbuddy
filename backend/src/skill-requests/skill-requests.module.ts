import { Module } from '@nestjs/common';
import { SkillRequestsController } from './skill-requests.controller';
import { SkillRequestsService } from './skill-requests.service';
import { AdminActionsModule } from '../admin/admin-actions.module';

@Module({
  imports: [AdminActionsModule],
  controllers: [SkillRequestsController],
  providers: [SkillRequestsService],
  // AdminModule owns the review endpoints and delegates to this service.
  exports: [SkillRequestsService],
})
export class SkillRequestsModule {}
