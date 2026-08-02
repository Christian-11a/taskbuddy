import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';
import { VerificationsService } from '../verifications/verifications.service';
import { ListBookingsQueryDto, ListUsersQueryDto } from './dto/admin.dto';
import {
  ListVerificationsQueryDto,
  RejectVerificationDto,
} from '../verifications/dto/verifications.dto';
import { EscrowService } from '../escrow/escrow.service';
import { DisputesService } from '../escrow/disputes.service';
import {
  ListDisputesQueryDto,
  ListTransactionsQueryDto,
  ResolveDisputeDto,
} from '../escrow/dto/escrow.dto';
import type { Profile } from '../common/types';

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly verificationsService: VerificationsService,
    private readonly escrowService: EscrowService,
    private readonly disputesService: DisputesService,
  ) {}

  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Post('users/:id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.suspend(id);
  }

  @Post('users/:id/reinstate')
  reinstate(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.reinstate(id);
  }

  @Get('bookings')
  listBookings(@Query() query: ListBookingsQueryDto) {
    return this.adminService.listBookings(query);
  }

  @Post('bookings/:id/cancel')
  cancelBooking(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.cancelBooking(id);
  }

  @Get('analytics/summary')
  analyticsSummary() {
    return this.adminService.analyticsSummary();
  }

  @Get('activity')
  recentActivity() {
    return this.adminService.recentActivity();
  }

  // ── Provider verification queue (migration 0008) ──────────────────────────

  @Get('verifications')
  listVerifications(@Query() query: ListVerificationsQueryDto) {
    return this.verificationsService.list(query);
  }

  @Post('verifications/:id/approve')
  approveVerification(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.verificationsService.approve(admin, id);
  }

  @Post('verifications/:id/reject')
  rejectVerification(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectVerificationDto,
  ) {
    return this.verificationsService.reject(admin, id, dto);
  }

  // ── Escrow transactions & disputes (migration 0009) ───────────────────────

  @Get('transactions')
  listTransactions(@Query() query: ListTransactionsQueryDto) {
    return this.escrowService.listForAdmin(query);
  }

  @Get('disputes')
  listDisputes(@Query() query: ListDisputesQueryDto) {
    return this.disputesService.listForAdmin(query);
  }

  @Post('disputes/:id/resolve')
  resolveDispute(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolve(admin, id, dto);
  }
}
