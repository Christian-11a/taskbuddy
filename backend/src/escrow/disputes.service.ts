import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EscrowService } from './escrow.service';
import { AdminActionsService } from '../admin/admin-actions.service';
import {
  ListDisputesQueryDto,
  RaiseDisputeDto,
  ResolveDisputeDto,
} from './dto/escrow.dto';
import type { Profile } from '../common/types';

interface DisputeRow {
  id: string;
  escrow_id: string;
  job_id: string;
  raised_by: string;
  status: 'open' | 'resolved' | 'cancelled';
}

const DISPUTE_SELECT =
  '*, jobs(title, service_categories(name)), ' +
  'escrow_transactions(amount, status, client_id, provider_id), ' +
  'raised_by_profile:profiles!disputes_raised_by_fkey(id, full_name)';

@Injectable()
export class DisputesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly escrow: EscrowService,
    private readonly adminActions: AdminActionsService,
  ) {}

  /** Both participants can ask admins to review held or recently settled work. */
  async raise(user: Profile, jobId: string, dto: RaiseDisputeDto) {
    const escrow = await this.escrow.findByJob(jobId);
    if (!escrow)
      throw new BadRequestException('This job has no payment to dispute');
    if (escrow.client_id !== user.id && escrow.provider_id !== user.id) {
      throw new ForbiddenException('Not your job');
    }
    const { data, error } = await this.supabase.admin.rpc('raise_job_dispute', {
      p_job_id: jobId,
      p_actor_id: user.id,
      p_reason: dto.reason,
      p_details: dto.details ?? null,
    });
    if (error?.code === '23505')
      throw new BadRequestException(
        'There is already an open dispute for this job',
      );
    if (error) throw new BadRequestException(error.message);
    await this.notify(
      user.id === escrow.client_id ? escrow.provider_id : escrow.client_id,
      'Dispute opened',
      `Admin review requested: ${dto.reason}`,
      jobId,
    );
    return data;
  }

  /** Either participant can see the dispute on a job they're part of. */
  async forJob(user: Profile, jobId: string) {
    const escrow = await this.escrow.findByJob(jobId);
    if (!escrow) return null;
    if (escrow.client_id !== user.id && escrow.provider_id !== user.id) {
      throw new ForbiddenException('Not your job');
    }
    const { data, error } = await this.supabase.admin
      .from('disputes')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async listForAdmin(query: ListDisputesQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    let builder = this.supabase.admin
      .from('disputes')
      .select(DISPUTE_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.status) builder = builder.eq('status', query.status);

    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);
    return { disputes: data ?? [], total: count ?? 0 };
  }

  /**
   * Admin decides. Releasing pays the provider out of the held escrow;
   * refunding closes it in the client's favour.
   */
  async resolve(admin: Profile, disputeId: string, dto: ResolveDisputeDto) {
    const dispute = await this.findOpen(disputeId);
    const escrow = await this.escrow.findByJob(dispute.job_id);
    if (!escrow) throw new NotFoundException('Escrow record not found');

    const settled = ['released', 'refunded', 'cancelled'].includes(
      escrow.status,
    );
    if (settled) {
      if (dto.resolution !== 'reviewed' || !dto.note?.trim()) {
        throw new BadRequestException(
          'This payment is already settled. Record the admin decision with a note; use the existing recovery-credit action for compensation.',
        );
      }
    } else if (dto.resolution === 'reviewed') {
      throw new BadRequestException(
        'Resolve the held payment by releasing or refunding it',
      );
    } else if (dto.resolution === 'released_to_provider') {
      await this.escrow.payOut(escrow);
    } else {
      await this.escrow.refund(escrow);
    }

    const { data, error } = await this.supabase.admin
      .from('disputes')
      .update({
        status: 'resolved',
        resolution: dto.resolution,
        resolution_note: dto.note ?? null,
        resolved_by: admin.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', disputeId)
      .eq('status', 'open')
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.adminActions.record(
      admin,
      'dispute.resolve',
      'disputes',
      disputeId,
      { resolution: dto.resolution, note: dto.note ?? null },
    );

    const outcome =
      dto.resolution === 'reviewed'
        ? 'reviewed by an admin; see the resolution note'
        : dto.resolution === 'released_to_provider'
          ? 'released to the provider'
          : 'refunded to the client';
    await Promise.all([
      this.notify(
        escrow.client_id,
        'Dispute resolved',
        `The payment was ${outcome}.`,
        dispute.job_id,
      ),
      this.notify(
        escrow.provider_id,
        'Dispute resolved',
        `The payment was ${outcome}.`,
        dispute.job_id,
      ),
    ]);
    return data;
  }

  private async findOpen(disputeId: string): Promise<DisputeRow> {
    const { data, error } = await this.supabase.admin
      .from('disputes')
      .select('*')
      .eq('id', disputeId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Dispute not found');
    const dispute = data as DisputeRow;
    if (dispute.status !== 'open') {
      throw new BadRequestException(
        `This dispute is already '${dispute.status}'`,
      );
    }
    return dispute;
  }

  private async notify(
    recipientId: string,
    title: string,
    body: string,
    jobId: string,
  ) {
    await this.supabase.admin.from('notifications').insert({
      recipient_id: recipientId,
      type: 'dispute_update',
      title,
      body,
      data: { job_id: jobId },
    });
  }
}
