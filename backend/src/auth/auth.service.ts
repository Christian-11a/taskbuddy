import * as crypto from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { isAllowedAppRedirect } from './google-redirect';
import {
  ChangePasswordDto,
  CompleteGoogleProfileDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SendEmailOtpDto,
  VerifyEmailOtpDto,
} from './dto/auth.dto';
import type { Profile } from '../common/types';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const GOOGLE_ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'GOOGLE_STATE_SECRET',
] as const;

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  stateSecret: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Surfaces missing Google config at boot instead of leaving it to blow up on
   * a user's first tap. Only a warning — email/password auth and the rest of
   * the API work fine without Google, so a local dev shouldn't be blocked.
   */
  onModuleInit() {
    const missing = GOOGLE_ENV_KEYS.filter((key) => !process.env[key]);
    if (missing.length) {
      this.logger.warn(
        `Google sign-in is disabled — missing env: ${missing.join(', ')}. ` +
          'See docs/google-auth-setup.md.',
      );
    }
  }

  /** Reads the Google env vars, failing with a 503 rather than a bare 500. */
  private googleConfig(): GoogleConfig {
    const missing = GOOGLE_ENV_KEYS.filter((key) => !process.env[key]);
    if (missing.length) {
      this.logger.error(
        `Google sign-in attempted without config: ${missing.join(', ')}`,
      );
      throw new ServiceUnavailableException(
        'Google sign-in is not configured on this server',
      );
    }
    return {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL!,
      stateSecret: process.env.GOOGLE_STATE_SECRET!,
    };
  }

  /**
   * Creates the auth user with role/full_name metadata; the on_auth_user_created
   * DB trigger creates the matching `profiles` row.
   */
  async register(dto: RegisterDto) {
    const { data, error } = await this.supabase.anon.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: {
          role: dto.role,
          full_name: dto.full_name,
          phone: dto.phone ?? null,
        },
      },
    });
    if (error) throw new BadRequestException(error.message);

    const userId = data.user?.id;

    // ── Persist consent timestamps + signup_category_id ────────────────────
    // The on_auth_user_created trigger already created the profiles row.
    // We update it immediately with consent timestamps (if the client sent
    // them) and the category bridge column. We use the admin client so this
    // works even when email confirmation is enabled (no user session yet).
    if (userId) {
      const now = new Date().toISOString();
      const consentPatch: Record<string, string | number | null> = {};
      if (dto.consented_terms) consentPatch.consented_terms_at = now;
      if (dto.consented_privacy) consentPatch.consented_privacy_at = now;
      if (dto.consented_data_collection)
        consentPatch.consented_data_collection_at = now;
      if (dto.consented_biometric) consentPatch.consented_biometric_at = now;
      if (dto.category_id) consentPatch.signup_category_id = dto.category_id;

      if (Object.keys(consentPatch).length > 0) {
        await this.supabase.admin
          .from('profiles')
          .update(consentPatch)
          .eq('id', userId);
      }

      // ── Seed provider_profiles at signup ───────────────────────────────
      // Creates the row with a NULL bio so the provider is visible to the
      // matching system immediately but must complete their profile before
      // applying to jobs (the Edit Profile screen enforces bio in UX).
      if (dto.role === 'provider' && dto.category_id) {
        await this.supabase.admin.from('provider_profiles').upsert(
          {
            profile_id: userId,
            category_id: dto.category_id,
            bio: null,
            years_experience: 0,
            is_available: false,
            service_radius_km: 15,
          },
          { onConflict: 'profile_id', ignoreDuplicates: true },
        );
      }
    }

    return {
      user: { id: data.user?.id, email: data.user?.email },
      // Session is null when email confirmation is enabled on the Supabase project.
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          }
        : null,
    };
  }

  async login(dto: LoginDto) {
    const { data, error } = await this.supabase.anon.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });
    if (error) throw new UnauthorizedException(error.message);

    // Suspended accounts must be rejected at login itself, not only by the
    // guard on later requests (story #29, TC-ADM-006).
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('deactivated_at, suspended_until, full_name, role')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile) {
      await this.enforceNotSuspended(
        data.user.id,
        data.session.access_token,
        profile,
      );
    }

    return {
      // full_name and role come free from the suspension lookup above. Without
      // them the web admin console had nothing to show but the email address.
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name ?? null,
        role: profile?.role ?? null,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    };
  }

  async refresh(dto: RefreshDto) {
    const { data, error } = await this.supabase.anon.auth.refreshSession({
      refresh_token: dto.refresh_token,
    });
    if (error || !data.session) {
      throw new UnauthorizedException(
        error?.message ?? 'Could not refresh session',
      );
    }
    return {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    };
  }

  async logout(accessToken: string) {
    await this.supabase.admin.auth.admin.signOut(accessToken);
    return { success: true };
  }

  /** Re-authenticates with the current password before rotating it, so a
   *  hijacked session can't silently lock the real owner out. */
  async changePassword(user: Profile, dto: ChangePasswordDto) {
    const { data: authData } = await this.supabase.admin.auth.admin.getUserById(
      user.id,
    );
    const email = authData?.user?.email;
    if (!email) throw new BadRequestException('Account has no email on file');

    const { error: reauthError } =
      await this.supabase.anon.auth.signInWithPassword({
        email,
        password: dto.current_password,
      });
    if (reauthError)
      throw new UnauthorizedException('Current password is incorrect');

    const { error } = await this.supabase.admin.auth.admin.updateUserById(
      user.id,
      {
        password: dto.new_password,
      },
    );
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  /**
   * Step 1 of the reset — mails a recovery code to the address.
   *
   * Always reports success. Whether an address has an account is not something
   * an unauthenticated caller gets to learn: returning 404 for unknown emails
   * turns this endpoint into a membership oracle anyone can enumerate. Real
   * failures (Supabase's per-hour email rate limit, SMTP misconfiguration) are
   * logged here instead, since the caller must not be able to tell those apart
   * from "no such user" either.
   *
   * This delivers a CODE, not a link — see docs/password-reset-setup.md for the
   * required Supabase email-template change. A mobile app cannot usefully
   * receive the default link: it lands in the phone's browser, not the app.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const { error } = await this.supabase.anon.auth.resetPasswordForEmail(
      dto.email,
    );
    if (error) {
      this.logger.warn(
        `Password reset email not sent for ${dto.email}: ${error.message}`,
      );
    }
    return { success: true };
  }

  /**
   * Step 2 — exchanges the emailed code for a session, then rotates the
   * password.
   *
   * Verifying the code first is what authenticates the request: only the holder
   * of the mailbox can produce it, and Supabase enforces its single use and
   * expiry. The returned session is handed back so the app can drop the user
   * straight into the signed-in state rather than bouncing them to Login with a
   * password they just typed twice.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { data, error } = await this.supabase.anon.auth.verifyOtp({
      email: dto.email,
      token: dto.token,
      type: 'recovery',
    });
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(
        error?.message ?? 'That reset code is invalid or has expired',
      );
    }

    // Suspended accounts must be rejected here too, consistent with login():
    // otherwise a reset is a way back in for an account an admin closed.
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('deactivated_at, suspended_until')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile) {
      await this.enforceNotSuspended(
        data.user.id,
        data.session.access_token,
        profile,
      );
    }

    const { error: updateError } =
      await this.supabase.admin.auth.admin.updateUserById(data.user.id, {
        password: dto.new_password,
      });
    if (updateError) throw new BadRequestException(updateError.message);

    return {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    };
  }

  // -- Registration email verification (OTP) ---------------------------------

  /**
   * Step 1 - mails a six-digit code to an address that registered but has not
   * confirmed yet. Item 5 of docs/backend-handoff-mobile-todo-gaps.md.
   *
   * This wraps Supabase's own signup OTP rather than issuing a code from a
   * table of our own, and that is the whole design decision. A hashed,
   * single-use, expiring, attempt-capped code table is easy; *delivering* it is
   * not, and this backend has no mail transport - every email the platform
   * sends leaves through Supabase Auth. Supabase's code is already all of those
   * things, and it does one thing a private table cannot: verifying it sets
   * `auth.users.email_confirmed_at`, so the address is confirmed to Auth itself
   * rather than only to us. A parallel code would leave the account
   * unconfirmed to Supabase while we insisted it was verified.
   *
   * See docs/email-otp-setup.md for the template change this needs: Supabase's
   * default confirmation email sends a link, which is useless to a phone (it
   * opens the device browser, not the app).
   *
   * Always reports success, for the same reason forgotPassword does: whether
   * an address has an account, and whether it is already confirmed, are not
   * things an unauthenticated caller gets to enumerate. Real failures -
   * Supabase's per-hour email rate limit, SMTP misconfiguration - are logged
   * here instead.
   */
  async sendEmailOtp(dto: SendEmailOtpDto) {
    const { error } = await this.supabase.anon.auth.resend({
      type: 'signup',
      email: dto.email,
    });
    if (error) {
      this.logger.warn(
        `Signup OTP not sent for ${dto.email}: ${error.message}`,
      );
    }
    return { success: true };
  }

  /**
   * Step 2 - exchanges the code for a confirmed account and a session.
   *
   * The session comes back for the same reason resetPassword returns one: the
   * user has just proved they hold the mailbox, so bouncing them to Login to
   * type a password they entered ninety seconds ago achieves nothing.
   *
   * `profiles.email_verified_at` is stamped alongside Supabase's own
   * `email_confirmed_at`. They are not redundant - the Supabase column also
   * gets set by clicking a confirmation link, and this one records that the
   * registration flow specifically saw the code come back.
   */
  async verifyEmailOtp(dto: VerifyEmailOtpDto) {
    const { data, error } = await this.supabase.anon.auth.verifyOtp({
      email: dto.email,
      token: dto.token,
      // 'signup' is the confirmation code for a newly registered address;
      // 'recovery' (used by resetPassword) is the password-reset code. They are
      // separate namespaces - one will not verify against the other.
      type: 'signup',
    });
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(
        error?.message ?? 'That verification code is invalid or has expired',
      );
    }

    // Consistent with login() and resetPassword(): a confirmed email is not a
    // way back into a suspended account.
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('deactivated_at, suspended_until')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile) {
      await this.enforceNotSuspended(
        data.user.id,
        data.session.access_token,
        profile,
      );
    }

    await this.supabase.admin
      .from('profiles')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', data.user.id);

    return {
      user: { id: data.user.id, email: data.user.email },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    };
  }

  // ── Google server-side OAuth ───────────────────────────────────────────────

  /**
   * Builds the Google authorization URL the browser should open.
   *
   * We generate a fresh nonce here on the backend and embed both the
   * hashed nonce (for Google) and the raw nonce (for Supabase) into a
   * signed state parameter so they survive the redirect without any
   * server-side storage.
   *
   * @param appRedirect  The deep-link URI the app passes in — Google never
   *   sees this, so exp:// and taskbuddy:// both work fine. It is checked
   *   against the allowlist here because the callback will later append live
   *   session tokens to it.
   */
  buildGoogleAuthUrl(appRedirect: string): string {
    const { clientId, callbackUrl, stateSecret } = this.googleConfig();

    if (!isAllowedAppRedirect(appRedirect)) {
      throw new BadRequestException('app_redirect is not an allowed target');
    }

    const rawNonce = crypto.randomUUID();
    const hashedNonce = crypto
      .createHash('sha256')
      .update(rawNonce)
      .digest('hex');

    // State encodes { rawNonce, appRedirect, exp } and is HMAC-signed so the
    // callback can verify it hasn't been tampered with (CSRF protection).
    const payload = JSON.stringify({
      rawNonce,
      appRedirect,
      exp: Date.now() + 10 * 60 * 1000, // 10 min window
    });
    const sig = crypto
      .createHmac('sha256', stateSecret)
      .update(payload)
      .digest('hex');
    const state = Buffer.from(payload).toString('base64url') + '.' + sig;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      nonce: hashedNonce,
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Attempts to extract appRedirect from a state string without full
   * verification.  Used only for error-redirect fallback in the controller.
   *
   * The signature is *not* checked here — by definition this runs when
   * verification already failed — so an attacker controls the payload. The
   * allowlist is therefore the only thing standing between this path and an
   * open redirect, and it is applied before the value is returned.
   */
  tryParseAppRedirect(state: string): string | null {
    try {
      const dotIdx = state.lastIndexOf('.');
      if (dotIdx === -1) return null;
      const payload = Buffer.from(
        state.substring(0, dotIdx),
        'base64url',
      ).toString();
      const { appRedirect } = JSON.parse(payload) as { appRedirect?: string };
      if (!appRedirect || !isAllowedAppRedirect(appRedirect)) return null;
      return appRedirect;
    } catch {
      return null;
    }
  }

  /**
   * Handles Google's redirect back to the backend.
   *
   * 1. Verifies the signed state (CSRF check + expiry).
   * 2. Exchanges the authorization code for an id_token via Google's token
   *    endpoint — the code exchange happens server-to-server so Google's
   *    redirect_uri is always the backend HTTPS URL, never the app deep-link.
   * 3. Passes the id_token + raw nonce to Supabase signInWithIdToken.
   * 4. Returns { appRedirect, session } so the controller can redirect the
   *    browser back to the app with the Supabase tokens in the query string.
   */
  async handleGoogleCallback(code: string, state: string) {
    const { clientId, clientSecret, callbackUrl, stateSecret } =
      this.googleConfig();
    if (!code) throw new BadRequestException('Missing authorization code');
    if (!state) throw new BadRequestException('Missing state parameter');

    // ── 1. Verify state ────────────────────────────────────────────────────
    const dotIdx = state.lastIndexOf('.');
    if (dotIdx === -1)
      throw new BadRequestException('Malformed state parameter');

    const dataPart = state.substring(0, dotIdx);
    const receivedSig = state.substring(dotIdx + 1);
    const payload = Buffer.from(dataPart, 'base64url').toString();
    const expectedSig = crypto
      .createHmac('sha256', stateSecret)
      .update(payload)
      .digest('hex');

    // Reject a malformed signature up front: Buffer.from(_, 'hex') stops at the
    // first non-hex character, so an unvalidated string can decode to a short
    // buffer and never reach a meaningful comparison.
    if (!/^[0-9a-f]{64}$/.test(receivedSig)) {
      throw new BadRequestException('Invalid state signature');
    }
    // Constant-time comparison prevents timing attacks.
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedSig, 'hex'),
        Buffer.from(expectedSig, 'hex'),
      )
    ) {
      throw new BadRequestException('Invalid state signature');
    }

    const { rawNonce, appRedirect, exp } = JSON.parse(payload) as {
      rawNonce: string;
      appRedirect: string;
      exp: number;
    };
    if (Date.now() > exp) throw new BadRequestException('State expired');
    // Defence in depth: the signature already proves we issued this redirect,
    // but re-checking means a leaked GOOGLE_STATE_SECRET still can't be turned
    // into a token-exfiltration endpoint.
    if (!isAllowedAppRedirect(appRedirect)) {
      throw new BadRequestException('app_redirect is not an allowed target');
    }

    // ── 2. Exchange code for id_token ──────────────────────────────────────
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokenData = (await tokenRes.json()) as {
      id_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenData.id_token) {
      throw new UnauthorizedException(
        tokenData.error_description ??
          tokenData.error ??
          'Google did not return an ID token',
      );
    }

    // ── 3. Sign in with Supabase ───────────────────────────────────────────
    const { data, error } = await this.supabase.anon.auth.signInWithIdToken({
      provider: 'google',
      token: tokenData.id_token,
      nonce: rawNonce,
    });
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(
        error?.message ?? 'Google sign-in failed',
      );
    }

    // Suspended accounts must be rejected here too, consistent with login().
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('deactivated_at, suspended_until')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile) {
      await this.enforceNotSuspended(
        data.user.id,
        data.session.access_token,
        profile,
      );
    }

    return {
      appRedirect,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    };
  }

  /**
   * Shared by login/resetPassword/handleGoogleCallback. A timed suspension
   * (BACKEND_SCHEMA.md §23.1) is lifted lazily right here rather than by a
   * cron job: once `suspended_until` is in the past, the three suspension
   * columns are cleared and the caller proceeds as if never suspended. An
   * indefinite suspension (`suspended_until` null) or one still in effect
   * signs the session out and blocks the request, as before.
   */
  private async enforceNotSuspended(
    userId: string,
    accessToken: string,
    suspension: {
      deactivated_at: string | null;
      suspended_until?: string | null;
    },
  ): Promise<void> {
    if (!suspension.deactivated_at) return;

    const expired =
      suspension.suspended_until != null &&
      new Date(suspension.suspended_until).getTime() <= Date.now();
    if (expired) {
      await this.supabase.admin
        .from('profiles')
        .update({
          deactivated_at: null,
          suspended_until: null,
          suspension_reason: null,
        })
        .eq('id', userId);
      return;
    }

    await this.supabase.admin.auth.admin.signOut(accessToken);
    throw new ForbiddenException('Account suspended');
  }

  /** Profile plus the provider extension when the caller is a provider. */
  async me(user: Profile) {
    // `profiles` has no email column (it lives in auth.users); attach it so the
    // frontends can display the account email without a second round-trip.
    const { data: authData } = await this.supabase.admin.auth.admin.getUserById(
      user.id,
    );
    const profile = { ...user, email: authData?.user?.email ?? null };

    if (user.role !== 'provider') return { profile, provider_profile: null };
    const { data } = await this.supabase.admin
      .from('provider_profiles')
      .select('*, service_categories(name)')
      .eq('profile_id', user.id)
      .maybeSingle();
    return { profile, provider_profile: data };
  }

  /**
   * Called by new Google OAuth users after they pick their role on the
   * GoogleRoleSelectionScreen.  The user is already authenticated — the JWT
   * guard puts their Profile on the request before this runs.
   *
   * Steps:
   *   1. Patch profiles: set real role + consent timestamps.
   *   2. Clear google_signup_pending.
   *   3. If role='provider' and category_id given, seed provider_profiles.
   */
  async completeGoogleProfile(
    user: Profile,
    dto: CompleteGoogleProfileDto,
  ): Promise<{ success: true }> {
    if (!user.google_signup_pending) {
      // Idempotent: if the flag is already cleared, treat as success.
      return { success: true };
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      role: dto.role,
      google_signup_pending: false,
    };
    if (dto.consented_terms) patch.consented_terms_at = now;
    if (dto.consented_privacy) patch.consented_privacy_at = now;
    if (dto.consented_data_collection) patch.consented_data_collection_at = now;
    if (dto.consented_biometric) patch.consented_biometric_at = now;
    if (dto.category_id) patch.signup_category_id = dto.category_id;

    const { error } = await this.supabase.admin
      .from('profiles')
      .update(patch)
      .eq('id', user.id);
    if (error) throw new BadRequestException(error.message);

    // Seed provider_profiles when the user chose Service Provider and supplied
    // a category.  Mirrors the same step in register() from migration 0015.
    if (dto.role === 'provider' && dto.category_id) {
      await this.supabase.admin.from('provider_profiles').upsert(
        {
          profile_id: user.id,
          category_id: dto.category_id,
          bio: null,
          years_experience: 0,
          is_available: false,
          service_radius_km: 15,
        },
        { onConflict: 'profile_id', ignoreDuplicates: true },
      );
    }

    return { success: true };
  }
}
