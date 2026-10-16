import { Module } from '@nestjs/common';
import { XenditService } from './xendit.service';

/**
 * Xendit (test mode) on its own, so escrow can send payouts without
 * depending on the payments module (which depends on escrow).
 */
@Module({
  providers: [XenditService],
  exports: [XenditService],
})
export class XenditModule {}
