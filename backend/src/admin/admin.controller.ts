import {
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
import { AdminService } from './admin.service';
import { ListBookingsQueryDto, ListUsersQueryDto } from './dto/admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
