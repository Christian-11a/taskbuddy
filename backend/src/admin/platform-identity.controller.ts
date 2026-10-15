import { Controller, Get } from '@nestjs/common';
import { AdminPlatformService } from './admin-platform.service';

@Controller('platform')
export class PlatformIdentityController {
  constructor(private readonly adminPlatform: AdminPlatformService) {}

  @Get('identity')
  getIdentity() {
    return this.adminPlatform.getPlatformIdentity();
  }
}
