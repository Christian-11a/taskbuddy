import * as crypto from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto';
import type { Profile } from '../common/types';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

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
      .select('deactivated_at, full_name, role')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile?.deactivated_at) {
      await this.supabase.admin.auth.admin.signOut(data.session.access_token);
      throw new ForbiddenException('Account suspended');
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
   *   sees this, so exp:// and taskbuddy:// both work fine.
   */
  buildGoogleAuthUrl(appRedirect: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL;
    const stateSecret = process.env.GOOGLE_STATE_SECRET;
    if (!clientId || !callbackUrl || !stateSecret) {
      throw new Error('Google OAuth environment variables are not configured');
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
    const state =
      Buffer.from(payload).toString('base64url') + '.' + sig;

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
   */
  tryParseAppRedirect(state: string): string | null {
    try {
      const dotIdx = state.lastIndexOf('.');
      if (dotIdx === -1) return null;
      const payload = Buffer.from(
        state.substring(0, dotIdx),
        'base64url',
      ).toString();
      return (JSON.parse(payload) as { appRedirect?: string }).appRedirect ?? null;
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
    const stateSecret = process.env.GOOGLE_STATE_SECRET!;
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL!;

    // ── 1. Verify state ────────────────────────────────────────────────────
    const dotIdx = state.lastIndexOf('.');
    if (dotIdx === -1) throw new BadRequestException('Malformed state parameter');

    const dataPart = state.substring(0, dotIdx);
    const receivedSig = state.substring(dotIdx + 1);
    const payload = Buffer.from(dataPart, 'base64url').toString();
    const expectedSig = crypto
      .createHmac('sha256', stateSecret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison prevents timing attacks.
    const a = Buffer.from(receivedSig.padEnd(64, '0'), 'hex');
    const b = Buffer.from(expectedSig.padEnd(64, '0'), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid state signature');
    }

    const { rawNonce, appRedirect, exp } = JSON.parse(payload) as {
      rawNonce: string;
      appRedirect: string;
      exp: number;
    };
    if (Date.now() > exp) throw new BadRequestException('State expired');

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
      .select('deactivated_at')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile?.deactivated_at) {
      await this.supabase.admin.auth.admin.signOut(data.session.access_token);
      throw new ForbiddenException('Account suspended');
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
}
