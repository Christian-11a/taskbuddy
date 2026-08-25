import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';
import { AdminActionsService } from './admin-actions.service';
import { AdminPlatformService } from './admin-platform.service';
import { VerificationsService } from '../verifications/verifications.service';
import {
  BroadcastNotificationDto,
  CreateAdminDto,
  CreateCategoryDto,
  ListActivityQueryDto,
  ListAuditQueryDto,
  ListBookingsQueryDto,
  ListUsersQueryDto,
  SuspendUserDto,
  UpdateCategoryDto,
  UpdateCommissionDto,
  UpdateMaintenanceDto,
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
import { WalletService } from '../wallet/wallet.service';
import {
  ListWalletTxnQueryDto,
  ListWithdrawalsQueryDto,
  RejectWithdrawalDto,
  SettleWithdrawalDto,
} from '../wallet/dto/wallet.dto';
import type { Profile } from '../common/types';

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminActionsService: AdminActionsService,
    private readonly adminPlatformService: AdminPlatformService,
    private readonly verificationsService: VerificationsService,
    private readonly escrowService: EscrowService,
    private readonly disputesService: DisputesService,
    private readonly chatService: ChatService,
    private readonly walletService: WalletService,
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

  // ── Platform maintenance mode (migration 0017) ────────────────────────────

  @Get('maintenance')
  getMaintenance() {
    return this.adminService.getMaintenance();
  }

  @Patch('maintenance')
  setMaintenance(
    @CurrentUser() admin: Profile,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.adminService.setMaintenance(admin, dto);
  }

  // ── Wallet ledger visibility (migration 0017) ─────────────────────────────

  @Get('wallet-transactions')
  listWalletTransactions(@Query() query: ListWalletTxnQueryDto) {
    return this.walletService.listForAdmin(query);
  }

  // ── Withdrawal settlement queue (migration 0023) ──────────────────────────

  /**
   * Withdrawal requests awaiting a human. There is no payout rail — money
   * enters through the Stripe webhook and leaves through whatever an admin
   * does by hand — so this queue is the disbursement mechanism, not a review
   * step in front of one.
   */
  @Get('withdrawals')
  listWithdrawals(@Query() query: ListWithdrawalsQueryDto) {
    return this.walletService.listWithdrawalsForAdmin(query);
  }

  /** Records that the money was actually sent. This is what debits the wallet. */
  @Post('withdrawals/:id/settle')
  settleWithdrawal(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleWithdrawalDto,
  ) {
    return this.walletService.settleWithdrawal(admin, id, dto.reference);
  }

  @Post('withdrawals/:id/reject')
  rejectWithdrawal(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.walletService.rejectWithdrawal(admin, id, dto.reason);
  }

  // ── Service catalogue (management for migration 0001's table) ─────────────────────

  @Get('categories')
  listCategories() {
    return this.adminPlatformService.listCategories();
  }

  @Post('categories')
  createCategory(
    @CurrentUser() admin: Profile,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.adminPlatformService.createCategory(admin, dto);
  }

  /** Rename, or deactivate. There is no delete — see the service comment. */
  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() admin: Profile,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.adminPlatformService.updateCategory(admin, id, dto);
  }

  // ── Admin accounts ────────────────────────────────────────────────────────

  @Get('admins')
  listAdmins() {
    return this.adminPlatformService.listAdmins();
  }

  /**
   * Creates or promotes an admin. No password crosses this boundary — the new
   * admin sets their own from the email this triggers.
   */
  @Post('admins')
  createAdmin(@CurrentUser() admin: Profile, @Body() dto: CreateAdminDto) {
    return this.adminPlatformService.createAdmin(admin, dto);
  }

  @Post('admins/:id/revoke')
  revokeAdmin(
    @CurrentUser() admin: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminPlatformService.revokeAdmin(admin, id);
  }

  // ── Notification broadcast ────────────────────────────────────────────────

  /**
   * One notification row per recipient, which the push scheduler then delivers
   * to whoever has push enabled. Returns what actually landed.
   */
  @Post('notifications/broadcast')
  broadcast(
    @CurrentUser() admin: Profile,
    @Body() dto: BroadcastNotificationDto,
  ) {
    return this.adminPlatformService.broadcast(admin, dto);
  }

  // ── Platform commission (migration 0023) ──────────────────────────────────

  @Get('commission')
  getCommission() {
    return this.adminPlatformService.getCommission();
  }

  /** Applies to escrow released from now on; settled jobs keep their figures. */
  @Patch('commission')
  setCommission(
    @CurrentUser() admin: Profile,
    @Body() dto: UpdateCommissionDto,
  ) {
    return this.adminPlatformService.setCommission(admin, dto);
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
