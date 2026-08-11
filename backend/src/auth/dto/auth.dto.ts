import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import type { UserRole } from '../../common/types';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(['client', 'provider'])
  role!: UserRole;

  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /**
   * Skill category chosen by the provider at signup.
   * Ignored for client (homeowner) registrations.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  category_id?: number;

  // ── Consent flags (mobile sends booleans; backend converts to timestamps) ──

  /** User accepted the Terms & Conditions. */
  @IsOptional()
  @IsBoolean()
  consented_terms?: boolean;

  /** User accepted the Privacy Policy. */
  @IsOptional()
  @IsBoolean()
  consented_privacy?: boolean;

  /** User accepted the general Data Collection consent. */
  @IsOptional()
  @IsBoolean()
  consented_data_collection?: boolean;

  /**
   * Provider accepted the RA 10173 biometric / govt-ID processing consent.
   * Required for role='provider'; ignored for 'client'.
   */
  @IsOptional()
  @IsBoolean()
  consented_biometric?: boolean;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  current_password!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  /** The recovery code from the email. Supabase issues 6 digits. */
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}

/**
 * Payload for POST /auth/complete-google-profile.
 *
 * Called by new Google OAuth users after they choose their role on the
 * GoogleRoleSelectionScreen. The caller is already authenticated (JWT guard)
 * so the user id comes from the JWT, not from this body.
 */
export class CompleteGoogleProfileDto {
  /** The role the user has chosen. */
  @IsIn(['client', 'provider'])
  role!: UserRole;

  /**
   * Skill category chosen by the provider.
   * Required when role='provider'; ignored for 'client'.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  category_id?: number;

  // ── Consent flags ──────────────────────────────────────────────────────────

  @IsOptional()
  @IsBoolean()
  consented_terms?: boolean;

  @IsOptional()
  @IsBoolean()
  consented_privacy?: boolean;

  @IsOptional()
  @IsBoolean()
  consented_data_collection?: boolean;

  /** RA 10173 biometric consent — required for providers. */
  @IsOptional()
  @IsBoolean()
  consented_biometric?: boolean;
}
