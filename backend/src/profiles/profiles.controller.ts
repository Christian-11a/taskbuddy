import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProfilesService } from './profiles.service';
import {
  SetAvailabilityDto,
  UpdateProfileDto,
  UpsertProviderProfileDto,
} from './dto/profiles.dto';
import type { AuthenticatedRequest, Profile } from '../common/types';

@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Patch('me')
  updateProfile(@CurrentUser() user: Profile, @Body() dto: UpdateProfileDto) {
    return this.profilesService.updateProfile(user, dto);
  }

  /**
   * Self-serve account deletion. 204 on success, 409 with a `blockers` array
   * when the account still has money or obligations in flight.
   *
   * The access token comes off the request rather than the body: the same
   * token that authorised this call is the one being invalidated.
   */
  @Delete('me')
  @HttpCode(204)
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    await this.profilesService.deleteAccount(req.user, req.accessToken);
  }

  @Put('me/provider')
  @Roles('provider')
  upsertProviderProfile(
    @CurrentUser() user: Profile,
    @Body() dto: UpsertProviderProfileDto,
  ) {
    return this.profilesService.upsertProviderProfile(user, dto);
  }

  @Patch('me/provider/availability')
  @Roles('provider')
  setAvailability(
    @CurrentUser() user: Profile,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.profilesService.setAvailability(user, dto);
  }
}
