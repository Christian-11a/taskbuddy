import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreateSkillRequestDto,
  ListSkillRequestsQueryDto,
  ReviewSkillRequestDto,
} from './dto/skill-requests.dto';
import type { Profile } from '../common/types';

const REQUEST_SELECT =
  '*, category:service_categories(id, name), ' +
  'provider:profiles!skill_change_requests_provider_id_fkey(full_name)';

/**
 * A provider's service is part of what clients hire on, so providers can't
 * change it themselves any more (QA, Sep 2026). They ask; an admin approves
 * or rejects. Approving a primary change swaps provider_profiles.category_id;
 * approving a secondary adds a provider_secondary_categories row (0034).
 */
@Injectable()
export class SkillRequestsService {
  constructor(private readonly supabase: SupabaseService) {}

  // ── Provider side ─────────────────────────────────────────────────────────

  async listMine(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('skill_change_requests')
      .select(REQUEST_SELECT)
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async create(user: Profile, dto: CreateSkillRequestDto) {
    const { data: category } = await this.supabase.admin
      .from('service_categories')
      .select('id')
      .eq('id', dto.category_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!category) {
      throw new BadRequestException('Unknown or inactive service');
    }

    const { data: provider } = await this.supabase.admin
      .from('provider_profiles')
      .select('category_id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!provider) {
      throw new BadRequestException('Complete your provider profile first');
    }
    if (provider.category_id === dto.category_id) {
      throw new BadRequestException('That is already your main service');
    }
    if (dto.type === 'add_secondary') {
      const { data: existing } = await this.supabase.admin
        .from('provider_secondary_categories')
        .select('category_id')
        .eq('provider_id', user.id)
        .eq('category_id', dto.category_id)
        .maybeSingle();
      if (existing) {
        throw new BadRequestException('You already offer that service');
      }
    }

    const { data, error } = await this.supabase.admin
      .from('skill_change_requests')
      .insert({
        provider_id: user.id,
        type: dto.type,
        category_id: dto.category_id,
        reason: dto.reason.trim(),
      })
      .select(REQUEST_SELECT)
      .single();
    // uq_skill_change_requests_one_pending
    if (error?.code === '23505') {
      throw new ConflictException('You already have a request under review');
    }
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async cancel(user: Profile, id: string) {
    const { data, error } = await this.supabase.admin
      .from('skill_change_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('provider_id', user.id)
      .eq('status', 'pending')
      .select(REQUEST_SELECT)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('No pending request to cancel');
    return data;
  }

  // ── Admin side ────────────────────────────────────────────────────────────

  async list(query: ListSkillRequestsQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    const paginated = query.limit !== undefined || query.offset !== undefined;
    if (query.search !== undefined) {
      const { data, error } = await this.supabase.admin.rpc(
        'admin_list_skill_requests',
        {
          p_search: query.search.trim() || null,
          p_status: query.status ?? null,
          p_limit: limit,
          p_offset: offset,
        },
      );
      if (error) throw new BadRequestException(error.message);
      const page = data?.[0];
      return { items: page?.rows ?? [], total: Number(page?.total ?? 0) };
    }
    let builder = this.supabase.admin
      .from('skill_change_requests')
      .select(REQUEST_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.status) builder = builder.eq('status', query.status);
    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);
    // Existing web builds expect a bare array; pagination opts into the envelope.
    return paginated ? { items: data ?? [], total: count ?? 0 } : (data ?? []);
  }

  approve(admin: Profile, id: string, dto: ReviewSkillRequestDto = {}) {
    return this.review(id, admin, 'approved', dto.note);
  }

  reject(admin: Profile, id: string, dto: ReviewSkillRequestDto = {}) {
    return this.review(id, admin, 'rejected', dto.note);
  }

  private async review(
    id: string,
    admin: Profile,
    status: 'approved' | 'rejected',
    note?: string,
  ) {
    const { data, error } = await this.supabase.admin.rpc(
      'review_service_request',
      {
        p_id: id,
        p_admin: admin.id,
        p_status: status,
        p_note: note ?? null,
      },
    );
    if (error) {
      if (error.message === 'Request not found')
        throw new NotFoundException(error.message);
      if (error.message === 'This request has already been decided')
        throw new ConflictException(error.message);
      throw new BadRequestException(error.message);
    }
    return data;
  }
}
