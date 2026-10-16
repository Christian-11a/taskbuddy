import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { Profile } from '../common/types';
import { PayoutAccountsService } from './payout-accounts.service';
import { LinkPayoutAccountDto } from './payout-account.dto';

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private readonly accounts: PayoutAccountsService) {}

  @Get('account')
  @Roles('provider')
  get(@CurrentUser() user: Profile) {
    return this.accounts.get(user);
  }

  @Put('account')
  @Roles('provider')
  link(@CurrentUser() user: Profile, @Body() dto: LinkPayoutAccountDto) {
    return this.accounts.link(user, dto);
  }

  @Delete('account')
  @Roles('provider')
  unlink(@CurrentUser() user: Profile) {
    return this.accounts.unlink(user);
  }

  /** Every payment, payout and refund on this account. */
  @Get('history')
  history(@CurrentUser() user: Profile) {
    return this.accounts.history(user);
  }
}
