import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JobsService } from './jobs.service';
import {
  BrowseJobsQueryDto,
  CreateJobDto,
  DeclineJobDto,
  UpdateJobTaskDto,
} from './dto/jobs.dto';
import type { Profile } from '../common/types';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @Roles('client')
  create(@CurrentUser() user: Profile, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user, dto);
  }

  @Get()
  @Roles('provider')
  browse(@Query() query: BrowseJobsQueryDto) {
    return this.jobsService.browse(query);
  }

  @Get('mine')
  @Roles('client')
  mine(@CurrentUser() user: Profile) {
    return this.jobsService.mine(user);
  }

  @Get('assigned')
  @Roles('provider')
  assigned(@CurrentUser() user: Profile) {
    return this.jobsService.assigned(user);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.getById(user, id);
  }

  @Post(':id/cancel')
  @Roles('client')
  cancel(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.cancel(user, id);
  }

  /** Provider accepts an incoming booking request → 'confirmed'. */
  @Post(':id/accept')
  @Roles('provider')
  accept(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.accept(user, id);
  }

  @Post(':id/start')
  @Roles('provider')
  start(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.start(user, id);
  }

  /** Assigned provider ticks a checklist item off while working. */
  @Patch(':id/tasks/:taskId')
  @Roles('provider')
  updateTask(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateJobTaskDto,
  ) {
    return this.jobsService.updateTask(user, id, taskId, dto);
  }

  @Post(':id/decline')
  @Roles('provider')
  decline(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineJobDto,
  ) {
    return this.jobsService.decline(user, id, dto);
  }

  @Post(':id/complete')
  @Roles('client')
  complete(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.complete(user, id);
  }
}
