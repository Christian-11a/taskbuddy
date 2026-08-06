import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { JobStatus, UserRole } from '../../common/types';

export class ListUsersQueryDto {
  /** Matches full_name or email, case-insensitive. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['client', 'provider', 'admin'])
  role?: UserRole;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;
}

export class SuspendUserDto {
  /** Omit for an indefinite suspension. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  duration_days?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ListBookingsQueryDto {
  @IsOptional()
  @IsIn([
    'open',
    'recommending',
    'assigned',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
  ])
  status?: JobStatus;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  category_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;
}

export class ListActivityQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ListAuditQueryDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsUUID()
  actor_id?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;
}
