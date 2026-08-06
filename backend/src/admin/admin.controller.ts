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
import { AdminActionsService } from './admin-actions.service';
import { VerificationsService } from '../verifications/verifications.service';
import {
  ListActivityQueryDto,
  ListAuditQueryDto,
  ListBookingsQueryDto,
  ListUsersQueryDto,
  SuspendUserDto,
} from './dto/admin.dto';
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
import { ChatService } from '../chat/chat.service';
import type { Profile } from '../common/types';

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminActionsService: AdminActionsService,
    private readonly verificationsService: VerificationsService,
    private readonly escrowService: EscrowService,
    private readonly disputesService: DisputesService,
    private readonly chatService: ChatService,
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
  suspend(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.adminService.suspend(admin, id, dto);
  }

  @Post('users/:id/reinstate')
  reinstate(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.reinstate(admin, id);
  }

  @Post('users/:id/send-password-reset')
  sendPasswordReset(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.sendPasswordReset(id);
  }

  @Get('bookings')
  listBookings(@Query() query: ListBookingsQueryDto) {
    return this.adminService.listBookings(query);
  }

  @Get('bookings/:id')
  async getBooking(@Param('id', ParseUUIDPipe) id: string) {
    const [job, escrow] = await Promise.all([
      this.adminService.getBooking(id),
      this.escrowService.findByJob(id),
    ]);
    return { ...job, escrow };
  }

  @Post('bookings/:id/cancel')
  cancelBooking(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.cancelBooking(admin, id);
  }

  @Get('analytics/summary')
  analyticsSummary() {
    return this.adminService.analyticsSummary();
  }

  @Get('activity')
  recentActivity(@Query() query: ListActivityQueryDto) {
    return this.adminService.recentActivity(query);
  }

  @Get('audit')
  listAudit(@Query() query: ListAuditQueryDto) {
    return this.adminActionsService.list(query);
  }

  @Get('jobs/:jobId/conversation')
  getJobConversation(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.chatService.adminConversationForJob(jobId);
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
