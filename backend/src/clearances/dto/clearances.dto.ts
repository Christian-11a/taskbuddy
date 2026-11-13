import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export const CLEARANCE_TYPES = ['nbi', 'police'] as const;
export type ClearanceType = (typeof CLEARANCE_TYPES)[number];

export const CLEARANCE_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'revoked',
] as const;
export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

/** `POST /providers/me/clearances` (0082). The photo is uploaded first. */
export class CreateClearanceDto {
  @IsIn(CLEARANCE_TYPES)
  clearance_type!: ClearanceType;

  @IsString()
  @Length(2, 60)
  clearance_number!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  issued_on?: string;

  /** Required: NBI and police clearances are valid for a limited time. */
  @IsISO8601({ strict: true })
  expires_on!: string;

  /** Storage path in the `provider-credentials` bucket. */
  @IsString()
  @Length(1, 300)
  document_path!: string;
}

export class ListClearancesQueryDto {
  @IsOptional()
  @IsIn(CLEARANCE_STATUSES)
  status?: ClearanceStatus;

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

export class RejectClearanceDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}
