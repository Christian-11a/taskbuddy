import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PushScheduler } from './push.scheduler';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [PushController],
  providers: [PushService, PushScheduler],
  // PushService: chat sends its own pushes, outside the notifications feed.
  exports: [PushScheduler, PushService],
})
export class PushModule {}
