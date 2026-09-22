import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JobsService } from './jobs.service';
import {
  AcceptJobDto,
  BrowseJobsQueryDto,
  CreateJobDto,
  GeocodeQueryDto,
  DeclineJobDto,
  StaticMapQueryDto,
  UpdateJobTaskDto,
} from './dto/jobs.dto';
import { GeocodingService } from '../geocoding/geocoding.service';
import { ThrottleGeocode, ThrottleStaticMap } from '../common/throttle';
import type { Profile } from '../common/types';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly geocoding: GeocodingService,
  ) {}

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

  /**
   * Resolve a typed address to verified coordinates before posting a job.
   * Declared above `:id`, which would otherwise claim the path and fail UUID
   * parsing on "geocode".
   */
  @Get('geocode')
  @Roles('client')
  @ThrottleGeocode()
  geocode(@Query() query: GeocodeQueryDto) {
    return this.geocoding.geocode(query.address);
  }

  /**
   * A PNG preview of a geocoded point, proxied so the Geoapify key never
   * reaches the app (BACKEND_SCHEMA.md §31.1). Also declared above `:id`.
   */
  @Get('static-map')
  @Roles('client')
  @ThrottleStaticMap()
  @Header('Cache-Control', 'private, max-age=86400')
  async staticMap(@Query() query: StaticMapQueryDto) {
    // Six decimals is ~10 cm; more only makes identical pins look different.
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    const png = await this.geocoding.staticMap(
      round(query.lat),
      round(query.lon),
    );
    return new StreamableFile(png, { type: 'image/png' });
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
  accept(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptJobDto,
  ) {
    return this.jobsService.accept(user, id, dto);
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
