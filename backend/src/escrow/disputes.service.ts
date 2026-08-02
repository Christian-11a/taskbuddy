import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EscrowService } from './escrow.service';
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
  ) {}

  /**
   * The client raises a dispute against a job's escrow. Only money that is
   * actually held can be disputed — once released or refunded there is nothing
   * left to argue over.
   */
  async raise(user: Profile, jobId: string, dto: RaiseDisputeDto) {
    const escrow = await this.escrow.findByJob(jobId);
    if (!escrow) {
      throw new BadRequestException('This job has no payment to dispute');
    }
    if (escrow.client_id !== user.id) {
      throw new ForbiddenException('Not your job');
    }
    if (escrow.status !== 'held') {
      throw new BadRequestException(
        `Cannot dispute a payment that is already '${escrow.status}'`,
      );
    }

    const { data, error } = await this.supabase.admin
      .from('disputes')
      .insert({
        escrow_id: escrow.id,
        job_id: jobId,
        raised_by: user.id,
        reason: dto.reason,
        details: dto.details ?? null,
      })
      .select('*')
      .single();
    // uq_disputes_one_open — only one live dispute per escrow.
    if (error?.code === '23505') {
      throw new BadRequestException(
        'There is already an open dispute for this job',
      );
    }
    if (error) throw new BadRequestException(error.message);

    await this.escrow.markDisputed(escrow.id);
    await this.notify(
      escrow.provider_id,
      'Payment disputed',
      `The client raised a dispute on this job: ${dto.reason}`,
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

    if (dto.resolution === 'released_to_provider') {
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
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);

    const outcome =
      dto.resolution === 'released_to_provider'
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
