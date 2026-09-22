import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('providers')
@UseGuards(JwtAuthGuard)
export class ProvidersController {
  constructor(private readonly supabase: SupabaseService) {}

  /** Public provider profile for marketplace display. */
  @Get(':id')
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const { data } = await this.supabase.admin
      .from('provider_profiles')
      .select(
        'profile_id, bio, years_experience, is_available, service_radius_km, is_verified, ' +
          'cached_avg_rating, cached_ratings_count, cached_completed_jobs, ' +
          'service_categories(name), ' +
          'profiles!provider_profiles_profile_id_fkey(full_name, avatar_url, city)',
      )
      .eq('profile_id', id)
      .maybeSingle();
    if (!data) throw new NotFoundException('Provider not found');
    return data;
  }

  /**
   * A provider's recent completed jobs, shown to clients as a lightweight
   * portfolio. Only the title, service and completion date: never the client,
   * the address or the job photos, which belong to other clients.
   */
  @Get(':id/work')
  async recentWork(@Param('id', ParseUUIDPipe) id: string) {
    const { data } = await this.supabase.admin
      .from('jobs')
      .select('id, title, completed_at, service_categories(name)')
      .eq('assigned_provider_id', id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(10);
    return data ?? [];
  }
}
