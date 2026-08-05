import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PushService } from './push.service';
import { RegisterDeviceDto } from './dto/push.dto';
import type { Profile } from '../common/types';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Called after the app is granted notification permission, and on each launch. */
  @Post()
  @HttpCode(200)
  register(@CurrentUser() user: Profile, @Body() dto: RegisterDeviceDto) {
    return this.push.registerDevice(user, dto);
  }

  /**
   * Called on sign-out, so the next person to use this handset does not
   * receive the previous account's notifications.
   */
  @Delete(':token')
  unregister(@CurrentUser() user: Profile, @Param('token') token: string) {
    return this.push.unregisterDevice(user, token);
  }
}
