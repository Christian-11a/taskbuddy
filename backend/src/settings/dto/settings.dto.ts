import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Every field is optional so the Settings screen can PATCH a single toggle
 * rather than echoing the whole object back. An empty body is a valid no-op
 * that returns the current settings.
 */
export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  push_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  email_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sms_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  location_sharing?: boolean;

  @IsOptional()
  @IsBoolean()
  dark_mode?: boolean;
}
