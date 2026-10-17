import {
  SERVICE_RADIUS_MAX_KM,
  SERVICE_RADIUS_MIN_KM,
} from '../service-radius';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 120, { message: 'Name must be 2–120 characters.' })
  @Matches(/^[\p{L} .,'()-]+$/u, {
    message:
      'Name may contain letters, spaces, and common name punctuation only.',
  })
  full_name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== '')
  @IsString()
  @Matches(/^09\d{9}$/, {
    message:
      'Phone number must be an 11-digit Philippine mobile number starting with 09.',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  @Length(5, 200, { message: 'Address must be 5–200 characters.' })
  address?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80, { message: 'City must be 2–80 characters.' })
  city?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 4096)
  location_reference?: string;

  // No latitude/longitude: coordinates come from a signed server reference or
  // server-side geocoding of `address` (BACKEND_SCHEMA.md §32). Accepting them from the client would let
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
  @Min(SERVICE_RADIUS_MIN_KM, {
    message: `service_radius_km must be at least ${SERVICE_RADIUS_MIN_KM} km`,
  })
  @Max(SERVICE_RADIUS_MAX_KM, {
    message: `service_radius_km must be at most ${SERVICE_RADIUS_MAX_KM} km`,
  })
  service_radius_km?: number;
}

export class SetAvailabilityDto {
  @IsBoolean()
  is_available!: boolean;
}
