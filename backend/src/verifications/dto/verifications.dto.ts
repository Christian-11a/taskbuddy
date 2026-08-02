import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { VerificationStatus } from '../../common/types';

export class SubmitVerificationDto {
  // Storage object paths from POST /uploads/signed-url, not URLs.
  @IsString()
  @IsNotEmpty()
  id_document_path!: string;

  @IsString()
  @IsNotEmpty()
  selfie_path!: string;
}

export class ListVerificationsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: VerificationStatus;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;
}

export class RejectVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
