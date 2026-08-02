import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
} from 'class-validator';
import type { JobUrgency } from '../../common/types';

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
  scheduled_at?: string;

  // Storage object paths returned by POST /uploads/signed-url, not URLs.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  photo_urls?: string[];
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
}
