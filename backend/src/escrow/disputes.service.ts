import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AddDisputeEntryDto,
  CancellationResponseDto,
  ListDisputesQueryDto,
  RaiseDisputeDto,
  ResolveDisputeDto,
} from './dto/escrow.dto';
import type { Profile } from '../common/types';

export interface EntryRow {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  author: { id: string; full_name: string; role: string } | null;
  message: { id: string; body: string; attachment_path: string | null } | null;
}
interface CaseRow {
  id: string;
  job_id: string;
  status: string;
  dispute_entries: EntryRow[];
}
const DISPUTE_SELECT =
  '*, jobs(title, client_id, assigned_provider_id, service_categories(name), client:profiles!jobs_client_id_fkey(full_name), provider:profiles!jobs_assigned_provider_id_fkey(full_name)), escrow_transactions(amount, status, client_id, provider_id), raised_by_profile:profiles!disputes_raised_by_fkey(id, full_name), dispute_entries(*, author:profiles!dispute_entries_author_id_fkey(id, full_name, role), message:messages!dispute_entries_message_id_fkey(id, body, attachment_path))';

@Injectable()
export class DisputesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly payouts: ConnectPayoutsService,
  ) {}

  async raise(user: Profile, jobId: string, dto: RaiseDisputeDto) {
    await this.assertParticipant(user, jobId);
    const { data, error } = await this.supabase.admin.rpc('raise_job_dispute', {
      p_job_id: jobId,
      p_actor_id: user.id,
      p_reason: dto.reason,
      p_details: dto.details ?? null,
    });
    if (error?.code === '23505')
      throw new BadRequestException(
        'There is already an open complaint for this job',
      );
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async forJob(user: Profile, jobId: string) {
    await this.assertParticipant(user, jobId);
    const { data, error } = await this.supabase.admin
      .from('disputes')
      .select(DISPUTE_SELECT)
      .eq('job_id', jobId)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data ? this.withEvidence(data as CaseRow) : null;
  }

  async listForAdmin(query: ListDisputesQueryDto) {
    const offset = query.offset ?? 0;
    let builder = this.supabase.admin
      .from('disputes')
      .select(DISPUTE_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + (query.limit ?? 50) - 1);
    if (query.status) builder = builder.eq('status', query.status);
    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);
    return {
      disputes: await Promise.all(
        (data as CaseRow[]).map((row) => this.withEvidence(row)),
      ),
      total: count ?? 0,
    };
  }

  async addEntry(user: Profile, id: string, dto: AddDisputeEntryDto) {
    const { data, error } = await this.supabase.admin.rpc('add_dispute_entry', {
      p_dispute_id: id,
      p_actor_id: user.id,
      p_kind: dto.kind,
      p_body: dto.body,
      p_message_id: dto.message_id ?? null,
    });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async clarify(admin: Profile, id: string, body: string) {
    const { data, error } = await this.supabase.admin.rpc('add_dispute_entry', {
      p_dispute_id: id,
      p_actor_id: admin.id,
      p_kind: 'clarification',
      p_body: body,
      p_message_id: null,
    });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async respond(user: Profile, id: string, dto: CancellationResponseDto) {
    const { data, error } = await this.supabase.admin.rpc(
      'respond_job_cancellation',
      {
        p_dispute_id: id,
        p_actor_id: user.id,
        p_accept: dto.accept,
        p_note: dto.note,
        p_message_id: dto.message_id ?? null,
      },
    );
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Settlement, case decision, history, audit and notifications share one transaction. */
  async resolve(admin: Profile, id: string, dto: ResolveDisputeDto) {
    const { data, error } = await this.supabase.admin.rpc(
      'resolve_job_dispute',
      {
        p_dispute_id: id,
        p_actor_id: admin.id,
        p_resolution: dto.resolution,
        p_note: dto.note,
      },
    );
    if (error) throw new BadRequestException(error.message);
    if (dto.resolution === 'released_to_provider' && data.escrow_id) {
      void this.payouts.processEscrow(data.escrow_id);
    }
    return data;
  }

  private async assertParticipant(user: Profile, jobId: string) {
    const { data, error } = await this.supabase.admin
      .from('jobs')
      .select('client_id, assigned_provider_id')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Job not found');
    if (data.client_id !== user.id && data.assigned_provider_id !== user.id)
      throw new ForbiddenException('Not your job');
  }

  private async withEvidence(row: CaseRow) {
    const entries = await Promise.all(
      row.dispute_entries.map(async (entry) => {
        let attachment_url: string | null = null;
        if (entry.message?.attachment_path) {
          const { data, error } = await this.supabase.admin.storage
            .from('chat-attachments')
            .createSignedUrl(entry.message.attachment_path, 3600);
          if (error)
            throw new BadRequestException(
              `Could not load case evidence: ${error.message}`,
            );
          attachment_url = data.signedUrl;
        }
        return { ...entry, attachment_url };
      }),
    );
    entries.sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
    return { ...row, entries };
  }
}
