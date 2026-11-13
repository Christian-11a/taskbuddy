import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { Profile } from '../common/types';
import { RevokeVerificationDto } from '../verifications/dto/verifications.dto';
import { ClearancesService } from './clearances.service';
import {
  CreateClearanceDto,
  ListClearancesQueryDto,
  RejectClearanceDto,
} from './dto/clearances.dto';

/** The provider's own NBI / police clearances (0082). */
@Controller('providers')
@UseGuards(JwtAuthGuard)
export class ClearancesController {
  constructor(private readonly clearances: ClearancesService) {}

  @Get('me/clearances')
  @Roles('provider')
  async mine(@CurrentUser() user: Profile) {
    const [clearances, required] = await Promise.all([
      this.clearances.mine(user),
      this.clearances.required(),
    ]);
    return { clearances, required };
  }

  @Post('me/clearances')
  @Roles('provider')
  create(@CurrentUser() user: Profile, @Body() dto: CreateClearanceDto) {
    return this.clearances.create(user, dto);
  }

  @Delete('me/clearances/:id')
  @Roles('provider')
  remove(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.clearances.remove(user, id);
  }
}

/** Admin review of clearances, and the duplicate signals for Screening. */
@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminClearancesController {
  constructor(private readonly clearances: ClearancesService) {}

  @Get('clearances')
  list(@Query() query: ListClearancesQueryDto) {
    return this.clearances.list(query);
  }

  @Post('clearances/:id/approve')
  approve(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clearances.approve(admin, id);
  }

  @Post('clearances/:id/reject')
  reject(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectClearanceDto,
  ) {
    return this.clearances.reject(admin, id, dto);
  }

  @Post('clearances/:id/revoke')
  revoke(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeVerificationDto,
  ) {
    return this.clearances.revoke(admin, id, dto);
  }

  @Get('users/:id/duplicates')
  async duplicates(@Param('id', ParseUUIDPipe) id: string) {
    return { duplicates: await this.clearances.duplicates(id) };
  }
}
