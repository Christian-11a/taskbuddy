import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  // The push scheduler filters recipients by their push_enabled preference.
  exports: [SettingsService],
})
export class SettingsModule {}
