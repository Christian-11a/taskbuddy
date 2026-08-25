import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

  /**
   * 'deleted' is opt-in. Accounts that deleted themselves are excluded from
   * the default list — they are not moderation subjects any more — but they
   * remain findable, because the rows they left behind (ledger, reviews, jobs)
   * still point at them and a question about one has to be answerable.
   */
  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted'])
  status?: 'active' | 'suspended' | 'deleted';

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
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn([
    'open',
    'recommending',
    'assigned',
    'confirmed',
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
  @IsString()
  @MaxLength(100)
  search?: string;

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

export class UpdateMaintenanceDto {
  @IsBoolean()
  maintenance_mode!: boolean;

  /** Shown to blocked users in place of the default message. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  maintenance_message?: string;
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

// ── Service category management (web/README.md, "Not yet built") ────────────

export class CreateCategoryDto {
  /** Unique in the schema; a duplicate comes back as a 409, not a 500. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  /**
   * Deactivation is the only kind of removal on offer. Jobs, provider profiles
   * and the ML feature set all reference a category by id; deleting one would
   * either cascade real history away or fail on the constraint. An inactive
   * category stops being offered to new jobs and keeps explaining the old ones.
   */
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

// ── Admin provisioning (web/README.md, "a second admin account") ────────────

export class CreateAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  full_name!: string;
}

// ── Notification broadcast (web/README.md, "Not yet built") ─────────────────

export class BroadcastNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body!: string;

  /**
   * Who receives it. Admins are never in the audience — a broadcast is a
   * message to the platform's users, and an admin notifying themselves is
   * noise in the one inbox that has to stay readable.
   */
  @IsIn(['all', 'clients', 'providers'])
  audience!: 'all' | 'clients' | 'providers';
}

// ── Platform commission (web/README.md, "Fee/commission model") ─────────────

export class UpdateCommissionDto {
  /**
   * Fraction, not percent: 0.15 is fifteen percent. The schema caps it at 0.5
   * and rejects a negative, so a percent typed here (15) is refused rather
   * than quietly charging 1500%.
   */
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(0.5)
  @Type(() => Number)
  commission_rate!: number;
}
