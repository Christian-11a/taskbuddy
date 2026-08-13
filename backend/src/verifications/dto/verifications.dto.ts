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

/**
 * Body for POST /verifications/identity-session.
 *
 * Both paths are optional and travel together. The mobile flow collects a
 * government ID and a selfie before handing off to Stripe Identity, and those
 * two images are worth keeping: when Stripe cannot reach a decision (an
 * unsupported document type, a session the provider abandons, Identity not
 * enabled on the account at all), an admin can still review the submission by
 * hand instead of the provider having to start over. A session opened without
 * them is still valid — it is simply Stripe's word or nothing.
 */
export class StartIdentitySessionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  id_document_path?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  selfie_path?: string;
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
