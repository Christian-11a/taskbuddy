import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadsService } from './uploads.service';
import { CreateSignedUploadDto } from './dto/uploads.dto';
import type { Profile } from '../common/types';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('signed-url')
  signedUrl(@CurrentUser() user: Profile, @Body() dto: CreateSignedUploadDto) {
    return this.uploadsService.createSignedUpload(user, dto);
  }
}
