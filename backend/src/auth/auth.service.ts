import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import type { Profile } from '../common/types';

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
      .select('deactivated_at')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile?.deactivated_at) {
      await this.supabase.admin.auth.admin.signOut(data.session.access_token);
      throw new ForbiddenException('Account suspended');
    }

    return {
      user: { id: data.user.id, email: data.user.email },
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

    const { error: reauthError } = await this.supabase.anon.auth.signInWithPassword({
      email,
      password: dto.current_password,
    });
    if (reauthError) throw new UnauthorizedException('Current password is incorrect');

    const { error } = await this.supabase.admin.auth.admin.updateUserById(user.id, {
      password: dto.new_password,
    });
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  /** Profile plus the provider extension when the caller is a provider. */
  async me(user: Profile) {
    // `profiles` has no email column (it lives in auth.users); attach it so the
    // frontends can display the account email without a second round-trip.
    const { data: authData } = await this.supabase.admin.auth.admin.getUserById(
      user.id,
    );
    const profile = { ...user, email: authData?.user?.email ?? null };

    if (user.role !== 'provider')
      return { profile, provider_profile: null };
    const { data } = await this.supabase.admin
      .from('provider_profiles')
      .select('*, service_categories(name)')
      .eq('profile_id', user.id)
      .maybeSingle();
    return { profile, provider_profile: data };
  }
}
