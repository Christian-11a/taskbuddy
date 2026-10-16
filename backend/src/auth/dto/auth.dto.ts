import {
  IsBoolean,
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
  MinLength,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import type { UserRole } from '../../common/types';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be 8–72 characters.' })
  @MaxLength(72, { message: 'Password must be 8–72 characters.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number.',
  })
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
  @ValidateIf((dto: RegisterDto) => dto.role === 'provider')
  @IsInt({ message: 'Choose a service category to register as a provider.' })
  @Min(1, { message: 'Choose a service category to register as a provider.' })
  category_id?: number;

  // ── Consent flags (mobile sends booleans; backend converts to timestamps) ──

  /** User accepted the Terms & Conditions. */
  @Equals(true, { message: 'Accept the Terms and Conditions to continue.' })
  consented_terms!: boolean;

  /** User accepted the Privacy Policy. */
  @Equals(true, { message: 'Accept the Privacy Policy to continue.' })
  consented_privacy!: boolean;

  /** User accepted the general Data Collection consent. */
  @Equals(true, { message: 'Accept the Data Collection consent to continue.' })
  consented_data_collection!: boolean;

  /**
   * Provider accepted the RA 10173 biometric / govt-ID processing consent.
   * Optional legacy signup field; current apps explain processing during verification.
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
  @MinLength(8, { message: 'New password must be 8–72 characters.' })
  @MaxLength(72, { message: 'New password must be 8–72 characters.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'New password must contain at least one letter and one number.',
  })
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
  @MinLength(8, { message: 'New password must be 8–72 characters.' })
  @MaxLength(72, { message: 'New password must be 8–72 characters.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'New password must contain at least one letter and one number.',
  })
  new_password!: string;
}

/**
 * Payload for POST /auth/complete-google-profile.
 *
 * Called by new Google OAuth users after they choose their role on the
 * GoogleRoleSelectionScreen. The caller is already authenticated (JWT guard)
 * so the user id comes from the JWT, not from this body.
 */
/**
 * `POST /auth/google/claim` — the one-time id the app minted before opening
 * the browser and now trades for its session (§19). Length-bounded because it
 * is hashed and looked up; anything else is not an id we issued.
 */
export class ClaimGoogleSessionDto {
  @IsString()
  @Length(16, 128)
  handoff_id!: string;
}

export class CompleteGoogleProfileDto {
  /** The role the user has chosen. */
  @IsIn(['client', 'provider'])
  role!: UserRole;

  /**
   * Skill category chosen by the provider.
   * Required when role='provider'; ignored for 'client'.
   */
  @ValidateIf((dto: CompleteGoogleProfileDto) => dto.role === 'provider')
  @IsInt({ message: 'Choose a service category to register as a provider.' })
  @Min(1, { message: 'Choose a service category to register as a provider.' })
  category_id?: number;

  // ── Consent flags ──────────────────────────────────────────────────────────

  @Equals(true, { message: 'Accept the Terms and Conditions to continue.' })
  consented_terms!: boolean;

  @Equals(true, { message: 'Accept the Privacy Policy to continue.' })
  consented_privacy!: boolean;

  @Equals(true, { message: 'Accept the Data Collection consent to continue.' })
  consented_data_collection!: boolean;

  /** Optional legacy identity-processing consent. */
  @IsOptional()
  @IsBoolean()
  consented_biometric?: boolean;
}

/**
 * POST /auth/send-email-otp — mails a six-digit code to a registered but
 * unconfirmed address.
 *
 * Address-only, deliberately. This runs before the user has a session (the
 * whole point is that they cannot get one yet), so there is nothing to
 * authenticate with, and asking for the password again would only teach people
 * to type it into more places.
 */
export class SendEmailOtpDto {
  @IsEmail()
  email!: string;
}

/** POST /auth/verify-email-otp — exchanges that code for a confirmed account. */
export class VerifyEmailOtpDto {
  @IsEmail()
  email!: string;

  /** The code from the email. Supabase issues 6 digits. */
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/** `POST /auth/accept-terms` — the version the user just read. */
export class AcceptTermsDto {
  @IsInt()
  @Min(1)
  version!: number;
}
