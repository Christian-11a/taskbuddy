import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import type { Profile } from '../common/types';

export interface UserSettings {
  profile_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  location_sharing: boolean;
  dark_mode: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Per-user preferences (migration 0011).
 *
 * A user with no row has never opened the Settings screen and is on defaults —
 * that is a normal state, not a missing record, so nothing here 404s. Reads
 * materialise the row and writes upsert it.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly supabase: SupabaseService) {}

  /** The caller's settings, creating the row on first access. */
  async get(user: Profile): Promise<UserSettings> {
    const { data, error } = await this.supabase.admin
      .from('user_settings')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (data) return data as UserSettings;

    // Insert with no columns beyond the key so the DDL defaults apply — they
    // are the single definition of what "default settings" means.
    const { data: created, error: createError } = await this.supabase.admin
      .from('user_settings')
      .upsert({ profile_id: user.id }, { onConflict: 'profile_id' })
      .select('*')
      .single();
    if (createError) throw new BadRequestException(createError.message);
    return created as UserSettings;
  }

  async update(user: Profile, dto: UpdateSettingsDto): Promise<UserSettings> {
    // A PATCH must not depend on the row already existing: the app's first
    // interaction with settings is usually flipping a toggle, not reading them.
    const { data, error } = await this.supabase.admin
      .from('user_settings')
      .upsert({ profile_id: user.id, ...dto }, { onConflict: 'profile_id' })
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data as UserSettings;
  }

  /**
   * Of `profileIds`, those who have not switched push off. Used by the push
   * scheduler, which must treat "no row" as opted in — the default is true and
   * most users never visit Settings at all.
   */
  async pushEnabledAmong(profileIds: string[]): Promise<Set<string>> {
    const unique = [...new Set(profileIds)];
    if (unique.length === 0) return new Set();

    const { data, error } = await this.supabase.admin
      .from('user_settings')
      .select('profile_id, push_enabled')
      .in('profile_id', unique)
      .eq('push_enabled', false);
    if (error) throw new BadRequestException(error.message);

    const optedOut = new Set((data ?? []).map((r) => r.profile_id as string));
    return new Set(unique.filter((id) => !optedOut.has(id)));
  }
}
