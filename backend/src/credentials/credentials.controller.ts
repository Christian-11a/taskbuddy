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
import { CredentialsService } from './credentials.service';
import {
  CreateCredentialDto,
  ListCredentialsQueryDto,
  RejectCredentialDto,
} from './dto/credentials.dto';

@Controller('providers')
@UseGuards(JwtAuthGuard)
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get('me/credentials')
  @Roles('provider')
  mine(@CurrentUser() user: Profile) {
    return this.credentials.mine(user);
  }

  @Post('me/credentials')
  @Roles('provider')
  create(@CurrentUser() user: Profile, @Body() dto: CreateCredentialDto) {
    return this.credentials.create(user, dto);
  }

  @Delete('me/credentials/:id')
  @Roles('provider')
  remove(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.credentials.remove(user, id);
  }

  @Get(':id/credentials')
  publicFor(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentials.publicFor(id);
  }
}

@Controller('admin/credentials')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminCredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  list(@Query() query: ListCredentialsQueryDto) {
    return this.credentials.list(query);
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.credentials.approve(admin, id);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectCredentialDto,
  ) {
    return this.credentials.reject(admin, id, dto);
  }
}
