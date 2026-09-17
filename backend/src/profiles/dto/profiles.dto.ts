import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  // No latitude/longitude: coordinates are derived server-side by geocoding
  // `address` (BACKEND_SCHEMA.md §32). Accepting them from the client would let
  // a provider place themselves anywhere and skew recommendation matching.
}

export class UpsertProviderProfileDto {
  @IsInt()
  category_id!: number;

  // Bounds mirror the DB CHECK constraint; the bio is an ML feature (provider_bio).
  @IsString()
  @Length(20, 400)
  bio!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  years_experience?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1000)
  service_radius_km?: number;
}

export class SetAvailabilityDto {
  @IsBoolean()
  is_available!: boolean;
}
