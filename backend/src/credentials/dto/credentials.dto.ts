import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CREDENTIAL_TYPES = [
  'tesda_nc',
  'prc_license',
  'trade_certificate',
  'other',
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_STATUSES = ['pending', 'approved', 'rejected'] as const;

/** `POST /providers/me/credentials`. The photo is uploaded first. */
export class CreateCredentialDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  category_id!: number;

  @IsIn(CREDENTIAL_TYPES)
  credential_type!: CredentialType;

  /** e.g. "Plumbing NC II", "Registered Master Electrician". */
  @IsString()
  @Length(2, 120)
  title!: string;

  /** e.g. "TESDA", "PRC". */
  @IsString()
  @Length(2, 120)
  issuer!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  credential_number?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  issued_on?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  expires_on?: string;

  /** Storage path in the `provider-credentials` bucket. */
  @IsString()
  @Length(1, 300)
  document_path!: string;
}

export class ListCredentialsQueryDto {
  @IsOptional()
  @IsIn(CREDENTIAL_STATUSES)
  status?: (typeof CREDENTIAL_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class RejectCredentialDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}
