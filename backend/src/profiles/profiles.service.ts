import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { AVATARS_BUCKET } from '../uploads/uploads.constants';
import {
  SetAvailabilityDto,
  UpdateProfileDto,
  UpsertProviderProfileDto,
} from './dto/profiles.dto';
import type { Profile } from '../common/types';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
  ) {}

  async updateProfile(user: Profile, dto: UpdateProfileDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.avatar_url !== undefined) {
      patch.avatar_url = this.resolveAvatar(user, dto.avatar_url);
    }

    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update(patch)
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * `avatar_url` accepts either of the two things that legitimately end up in
   * that column, and normalises both to something an <Image> can render:
   *
   *   - a Storage object path from POST /uploads/signed-url, which is what the
   *     app's "Change Photo" flow produces. Converted to a public URL here so
   *     every consumer — job cards, chat headers, the admin console — can use
   *     the column directly instead of each learning the bucket layout.
   *   - an absolute https URL, which is what Google hands us at sign-in.
   *
   * Ownership is checked before conversion. Without it, passing another user's
   * path would silently adopt their photo, and passing an arbitrary http URL
   * would let a profile beacon every viewer to a third-party server.
   */
  private resolveAvatar(user: Profile, value: string): string | null {
    if (value === '') return null;

    if (/^https?:\/\//i.test(value)) {
      if (!value.toLowerCase().startsWith('https://')) {
        throw new BadRequestException('avatar_url must be an https URL');
      }
      return value;
    }

    this.uploads.assertOwnedPaths(user, [value]);
    return this.uploads.publicUrl(AVATARS_BUCKET, value);
  }

  async upsertProviderProfile(user: Profile, dto: UpsertProviderProfileDto) {
    const { data: category } = await this.supabase.admin
      .from('service_categories')
      .select('id')
      .eq('id', dto.category_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!category)
      throw new BadRequestException('Unknown or inactive category_id');

    // cached_* columns are intentionally never written here — triggers own them.
    const { data, error } = await this.supabase.admin
      .from('provider_profiles')
      .upsert(
        {
          profile_id: user.id,
          category_id: dto.category_id,
          bio: dto.bio,
          years_experience: dto.years_experience ?? 0,
          service_radius_km: dto.service_radius_km ?? 15.0,
        },
        { onConflict: 'profile_id' },
      )
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async setAvailability(user: Profile, dto: SetAvailabilityDto) {
    const { data, error } = await this.supabase.admin
      .from('provider_profiles')
      .update({ is_available: dto.is_available })
      .eq('profile_id', user.id)
      .select()
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Provider profile not set up yet');
    return data;
  }
}
