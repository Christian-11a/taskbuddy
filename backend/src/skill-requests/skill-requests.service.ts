import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AdminActionsService } from '../admin/admin-actions.service';
import {
  CreateSkillRequestDto,
  ListSkillRequestsQueryDto,
  ReviewSkillRequestDto,
} from './dto/skill-requests.dto';
import type { Profile } from '../common/types';

const REQUEST_SELECT =
  '*, category:service_categories(id, name), ' +
  'provider:profiles!skill_change_requests_provider_id_fkey(full_name)';

interface SkillRequestRow {
  id: string;
  provider_id: string;
  type: 'change_primary' | 'add_secondary';
  category_id: number;
  status: string;
  category?: { id: number; name: string } | null;
}

/**
 * A provider's service is part of what clients hire on, so providers can't
 * change it themselves any more (QA, Sep 2026). They ask; an admin approves
 * or rejects. Approving a primary change swaps provider_profiles.category_id;
 * approving a secondary adds a provider_secondary_categories row (0034).
 */
@Injectable()
export class SkillRequestsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly adminActions: AdminActionsService,
  ) {}

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
    let builder = this.supabase.admin
      .from('skill_change_requests')
      .select(REQUEST_SELECT)
      .order('created_at', { ascending: false })
      .limit(100);
    if (query.status) builder = builder.eq('status', query.status);
    const { data, error } = await builder;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async approve(admin: Profile, id: string, dto: ReviewSkillRequestDto = {}) {
    const row = await this.findPending(id);

    if (row.type === 'change_primary') {
      const { error } = await this.supabase.admin
        .from('provider_profiles')
        .update({ category_id: row.category_id })
        .eq('profile_id', row.provider_id);
      if (error) throw new BadRequestException(error.message);
      // A service that became the main one is no longer a secondary.
      await this.supabase.admin
        .from('provider_secondary_categories')
        .delete()
        .eq('provider_id', row.provider_id)
        .eq('category_id', row.category_id);
    } else {
      const { error } = await this.supabase.admin
        .from('provider_secondary_categories')
        .insert({ provider_id: row.provider_id, category_id: row.category_id });
      if (error && error.code !== '23505') {
        throw new BadRequestException(error.message);
      }
    }

    const updated = await this.review(id, admin, 'approved', dto.note);
    await this.adminActions.record(
      admin,
      'skill_request.approve',
      'skill_change_requests',
      id,
      { type: row.type, category_id: row.category_id },
    );
    const service = row.category?.name ?? 'the service';
    await this.notify(
      row.provider_id,
      'Service request approved',
      row.type === 'change_primary'
        ? `Your main service is now ${service}.`
        : `${service} has been added to your services.`,
    );
    return updated;
  }

  async reject(admin: Profile, id: string, dto: ReviewSkillRequestDto = {}) {
    const row = await this.findPending(id);
    const updated = await this.review(id, admin, 'rejected', dto.note);
    await this.adminActions.record(
      admin,
      'skill_request.reject',
      'skill_change_requests',
      id,
      { note: dto.note ?? null },
    );
    await this.notify(
      row.provider_id,
      'Service request not approved',
      dto.note
        ? `Your request to ${row.type === 'change_primary' ? 'change' : 'add'} ${row.category?.name ?? 'a service'} was not approved: ${dto.note}`
        : `Your request to ${row.type === 'change_primary' ? 'change' : 'add'} ${row.category?.name ?? 'a service'} was not approved.`,
    );
    return updated;
  }

  private async findPending(id: string): Promise<SkillRequestRow> {
    const { data, error } = await this.supabase.admin
      .from('skill_change_requests')
      .select(REQUEST_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Request not found');
    const row = data as unknown as SkillRequestRow;
    if (row.status !== 'pending') {
      throw new ConflictException('This request has already been decided');
    }
    return row;
  }

  private async review(
    id: string,
    admin: Profile,
    status: 'approved' | 'rejected',
    note?: string,
  ) {
    const { data, error } = await this.supabase.admin
      .from('skill_change_requests')
      .update({
        status,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        review_note: note ?? null,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select(REQUEST_SELECT)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new ConflictException('This request has already been decided');
    }
    return data;
  }

  private async notify(recipientId: string, title: string, body: string) {
    await this.supabase.admin.from('notifications').insert({
      recipient_id: recipientId,
      type: 'skill_request_update',
      title,
      body,
      data: null,
    });
  }
}
