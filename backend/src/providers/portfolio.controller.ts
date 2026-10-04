import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { Profile } from '../common/types';
import { PortfolioService } from './portfolio.service';
import { CreatePortfolioDto, PortfolioDetailsDto } from './dto/portfolio.dto';
@Controller('providers')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}
  @Get('me/portfolio')
  @Roles('provider')
  mine(@CurrentUser() user: Profile) {
    return this.portfolio.list(user, user.id);
  }
  @Get(':id/portfolio')
  list(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.portfolio.list(user, id);
  }
  @Post('me/portfolio')
  @Roles('provider')
  create(@CurrentUser() user: Profile, @Body() dto: CreatePortfolioDto) {
    return this.portfolio.create(user, dto);
  }
  @Patch('me/portfolio/:id')
  @Roles('provider')
  update(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PortfolioDetailsDto,
  ) {
    return this.portfolio.update(user, id, dto);
  }
  @Delete('me/portfolio/:id')
  @Roles('provider')
  remove(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.portfolio.remove(user, id);
  }
}
