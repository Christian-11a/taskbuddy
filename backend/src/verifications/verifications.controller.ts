import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
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

  /**
   * Starts a Stripe Identity session instead of uploading documents here.
   * Returns what the mobile SDK needs to present the verification sheet; the
   * result arrives later by webhook, so the app should poll GET /verifications/me.
   */
  @Post('identity-session')
  @HttpCode(200)
  startIdentity(@CurrentUser() user: Profile) {
    return this.verificationsService.startIdentitySession(user);
  }

  @Get('me')
  mine(@CurrentUser() user: Profile) {
    return this.verificationsService.mine(user);
  }
}
