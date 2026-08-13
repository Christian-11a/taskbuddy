import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Validate,
  ValidatorConstraint,
} from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import type { JobUrgency } from '../../common/types';

/**
 * Rejects a scheduled start that has already happened.
 *
 * The client's device decides what "now" is when it builds the timestamp, and
 * a phone with a wrong clock (or a request replayed later) can produce a job
 * nobody can ever turn up for. A small grace window absorbs ordinary clock
 * skew and the seconds between tapping Post and the request landing, so a
 * booking made for "in five minutes" is not rejected for arriving late.
 */
const PAST_SCHEDULE_GRACE_MS = 5 * 60 * 1000;

@ValidatorConstraint({ name: 'isNotPastInstant', async: false })
export class IsNotPastInstantConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return true; // @IsISO8601 reports the shape
    const when = new Date(value).getTime();
    if (Number.isNaN(when)) return true;
    return when >= Date.now() - PAST_SCHEDULE_GRACE_MS;
  }

  defaultMessage(): string {
    return 'scheduled_at cannot be in the past';
  }
}

export class CreateJobDto {
  @IsInt()
  @Type(() => Number)
  category_id!: number;

  // Length bounds mirror the DB CHECK constraints (schema §3).
  @IsString()
  @Length(5, 120)
  title!: string;

  @IsString()
  @Length(20, 750)
  description!: string;

  @IsOptional()
  @IsIn(['urgent', 'normal', 'flexible'])
  urgency?: JobUrgency;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsLatitude()
  @Type(() => Number)
  latitude!: number;

  @IsLongitude()
  @Type(() => Number)
  longitude!: number;

  // Client's budget in PHP. Optional — jobs posted without one behave as before.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  budget?: number;

  // Preferred start time. When set, accepting an application auto-creates the
  // provider's booking (trigger handle_application_accepted, migration 0007).
  @IsOptional()
  @IsISO8601()
  @Validate(IsNotPastInstantConstraint)
  scheduled_at?: string;

  // Storage object paths returned by POST /uploads/signed-url, not URLs.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  photo_urls?: string[];

  /**
   * The checklist the client picked in step 3 of the guided creation flow, in
   * display order (migration 0019). Labels, not ids — the suggestion catalogue
   * is presentation and may change without rewriting old jobs.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  tasks?: string[];
}

/** The assigned provider ticking one checklist item off, or back on. */
export class UpdateJobTaskDto {
  @IsBoolean()
  is_done!: boolean;
}

export class BrowseJobsQueryDto {
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

  // Provider's current location, used to filter the feed to nearby jobs.
  // Both must be present together for the filter to apply.
  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  radius_km?: number;
}

export class DeclineJobDto {
  // Mirrors escrow's RaiseDisputeDto reason bounds (schema §21 precedent).
  @IsString()
  @Length(1, 200)
  reason!: string;
}
