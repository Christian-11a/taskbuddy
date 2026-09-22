import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SkillRequestsService } from './skill-requests.service';
import { CreateSkillRequestDto } from './dto/skill-requests.dto';
import type { Profile } from '../common/types';

/** Provider-facing routes. The admin queue lives on AdminController. */
@Controller('skill-requests')
@UseGuards(JwtAuthGuard)
@Roles('provider')
export class SkillRequestsController {
  constructor(private readonly skillRequests: SkillRequestsService) {}

  @Get('me')
  listMine(@CurrentUser() user: Profile) {
    return this.skillRequests.listMine(user);
  }

  @Post()
  create(@CurrentUser() user: Profile, @Body() dto: CreateSkillRequestDto) {
    return this.skillRequests.create(user, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.skillRequests.cancel(user, id);
  }
}
