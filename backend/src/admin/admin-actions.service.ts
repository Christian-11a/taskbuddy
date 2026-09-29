import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListAuditQueryDto } from './dto/admin.dto';
import type { Profile } from '../common/types';

const ACTION_SELECT =
  '*, actor:profiles!admin_actions_actor_id_fkey(id, full_name)';

/**
 * The audit trail for admin-initiated moderation actions (migration 0014,
 * BACKEND_SCHEMA.md §23.5). Distinct from job_status_history, which audits job
 * lifecycle transitions, not the admin behind a moderation decision.
 *
 * A standalone module (rather than living on AdminService) so services outside
 * admin/ — VerificationsService, DisputesService — can write to it without a
 * dependency on AdminModule.
 */
@Injectable()
export class AdminActionsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Fire-and-forget from the caller's perspective, but errors are surfaced
   * rather than swallowed: a write that silently failed would defeat the point
   * of an audit trail, and every call site here is already inside an admin
   * action whose own error handling this can join.
   */
  async record(
    actor: Profile,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown> = {},
  ) {
    const { error } = await this.supabase.admin.from('admin_actions').insert({
      actor_id: actor.id,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
    });
    if (error) throw new BadRequestException(error.message);
  }

  async list(query: ListAuditQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    if (query.search) {
      const { data, error } = await this.supabase.admin.rpc(
        'admin_search_audit',
        {
          p_search: query.search,
          p_action: query.action ?? null,
          p_actor_id: query.actor_id ?? null,
          p_from: query.from ?? null,
          p_to: query.to ?? null,
          p_limit: limit,
          p_offset: offset,
        },
      );
      if (error) throw new BadRequestException(error.message);
      return { actions: data[0].rows, total: Number(data[0].total) };
    }
    let builder = this.supabase.admin
      .from('admin_actions')
      .select(ACTION_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.action) builder = builder.eq('action', query.action);
    if (query.actor_id) builder = builder.eq('actor_id', query.actor_id);
    if (query.from) builder = builder.gte('created_at', query.from);
    if (query.to) builder = builder.lte('created_at', query.to);

    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);
    return { actions: data ?? [], total: count ?? 0 };
  }
}
