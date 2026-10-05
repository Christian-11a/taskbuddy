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
import { DisputesService } from './disputes.service';
import {
  AddDisputeEntryDto,
  CancellationResponseDto,
  RaiseDisputeDto,
} from './dto/escrow.dto';
import type { Profile } from '../common/types';

/**
 * Job-scoped dispute routes. Prefix is empty so these sit under /jobs, matching
 * how ApplicationsController and ReviewsController nest their job routes.
 * The admin review queue lives on AdminController.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post('jobs/:jobId/disputes')
  @Roles('client', 'provider')
  raise(
    @CurrentUser() user: Profile,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: RaiseDisputeDto,
  ) {
    return this.disputesService.raise(user, jobId, dto);
  }

  @Get('jobs/:jobId/disputes')
  forJob(
    @CurrentUser() user: Profile,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.disputesService.forJob(user, jobId);
  }
  @Post('disputes/:id/entries')
  @Roles('client', 'provider')
  addEntry(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDisputeEntryDto,
  ) {
    return this.disputesService.addEntry(user, id, dto);
  }
  @Post('disputes/:id/cancellation-response')
  @Roles('provider')
  respond(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancellationResponseDto,
  ) {
    return this.disputesService.respond(user, id, dto);
  }
}
