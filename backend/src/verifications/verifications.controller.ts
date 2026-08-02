import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { VerificationsService } from './verifications.service';
import { SubmitVerificationDto } from './dto/verifications.dto';
import type { Profile } from '../common/types';

/** Provider-facing routes. The admin review queue lives on AdminController. */
@Controller('verifications')
@UseGuards(JwtAuthGuard)
@Roles('provider')
export class VerificationsController {
  constructor(private readonly verificationsService: VerificationsService) {}

  @Post()
  submit(@CurrentUser() user: Profile, @Body() dto: SubmitVerificationDto) {
    return this.verificationsService.submit(user, dto);
  }

  @Get('me')
  mine(@CurrentUser() user: Profile) {
    return this.verificationsService.mine(user);
  }
}
