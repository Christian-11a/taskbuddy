import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import type { Profile } from '../common/types';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() user: Profile) {
    return this.settings.get(user);
  }

  @Patch()
  update(@CurrentUser() user: Profile, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(user, dto);
  }
}
