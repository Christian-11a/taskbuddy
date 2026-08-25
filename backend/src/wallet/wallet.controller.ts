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
import { CurrentUser } from '../auth/current-user.decorator';
import { WalletService } from './wallet.service';
import { CreateWalletTxnDto, RequestWithdrawalDto } from './dto/wallet.dto';
import type { Profile } from '../common/types';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  overview(@CurrentUser() user: Profile) {
    return this.walletService.overview(user);
  }

  @Get('withdrawals')
  listWithdrawals(@CurrentUser() user: Profile) {
    return this.walletService.listWithdrawals(user);
  }

  /**
   * Files a withdrawal request. Returns a `pending` ledger row — the money has
   * not moved and will not until an admin settles it from the console queue.
   */
  @Post('withdrawals')
  requestWithdrawal(
    @CurrentUser() user: Profile,
    @Body() dto: RequestWithdrawalDto,
  ) {
    return this.walletService.requestWithdrawal(user, dto);
  }

  @Post('withdrawals/:id/cancel')
  cancelWithdrawal(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.walletService.cancelWithdrawal(user, id);
  }

  /**
   * @deprecated Superseded by `POST /wallet/withdrawals`. Kept so a client
   * built against the old body keeps working; it now produces the same pending
   * request rather than a completed ledger row.
   */
  @Post('transactions')
  create(@CurrentUser() user: Profile, @Body() dto: CreateWalletTxnDto) {
    return this.walletService.create(user, dto);
  }
}
