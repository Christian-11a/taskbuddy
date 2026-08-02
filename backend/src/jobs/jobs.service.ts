import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { EscrowService } from '../escrow/escrow.service';
import { BrowseJobsQueryDto, CreateJobDto } from './dto/jobs.dto';
import type { Profile } from '../common/types';

// The assigned-provider embed needs the FK hint: jobs has two FKs to profiles
// (client_id and assigned_provider_id). Mobile's My Jobs list renders this name.
// Keep this a single string literal — concatenating widens the type to `string`
// and supabase-js can no longer infer the row shape from it.
const JOB_SELECT =
  '*, service_categories(name), assigned_provider:profiles!jobs_assigned_provider_id_fkey(id, full_name)';

@Injectable()
export class JobsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
    private readonly escrow: EscrowService,
  ) {}

  async create(user: Profile, dto: CreateJobDto) {
    if (dto.photo_urls?.length) {
      this.uploads.assertOwnedPaths(user, dto.photo_urls);
    }
    const { data, error } = await this.supabase.admin
      .from('jobs')
      .insert({
        client_id: user.id,
        category_id: dto.category_id,
        title: dto.title,
        description: dto.description,
        urgency: dto.urgency ?? 'normal',
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        budget: dto.budget ?? null,
        scheduled_at: dto.scheduled_at ?? null,
        photo_urls: dto.photo_urls ?? [],
        // recommendation_deadline is filled in by the DB trigger; the column is
        // NOT NULL so send a placeholder the trigger overwrites.
        recommendation_deadline: new Date().toISOString(),
      })
      .select(JOB_SELECT)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Provider browse: open/recommending jobs, newest first. */
  async browse(query: BrowseJobsQueryDto) {
    let builder = this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .in('status', ['open', 'recommending'])
      .order('posted_at', { ascending: false })
      .range(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 20) - 1);
    if (query.category_id)
      builder = builder.eq('category_id', query.category_id);
    const { data, error } = await builder;
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async mine(user: Profile) {
    const { data } = await this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });
    return data ?? [];
  }

  async assigned(user: Profile) {
    const { data } = await this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .eq('assigned_provider_id', user.id)
      .order('assigned_at', { ascending: false });
    return data ?? [];
  }

  async getById(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    const isOwner = job.client_id === user.id;
    const isAssigned = job.assigned_provider_id === user.id;
    const isBrowsable =
      user.role === 'provider' && ['open', 'recommending'].includes(job.status);
    if (!isOwner && !isAssigned && !isBrowsable) {
      throw new ForbiddenException('You do not have access to this job');
    }
    return job;
  }

  /** Client cancels from any pre-completion state. */
  async cancel(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    if (job.client_id !== user.id) throw new ForbiddenException('Not your job');
    if (
      !['open', 'recommending', 'assigned', 'in_progress'].includes(job.status)
    ) {
      throw new BadRequestException(
        `Cannot cancel a job in status '${job.status}'`,
      );
    }
    const updated = await this.setStatus(jobId, 'cancelled');
    // Release the hold. A disputed escrow is left for an admin to resolve.
    await this.escrow.cancelForJob(jobId);
    if (job.assigned_provider_id) {
      await this.notify(
        job.assigned_provider_id,
        'job_update',
        'Job cancelled',
        {
          body: `The job "${job.title}" was cancelled by the client.`,
          job_id: jobId,
        },
      );
    }
    return updated;
  }

  /** Assigned provider marks work started. */
  async start(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    if (job.assigned_provider_id !== user.id) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    if (job.status !== 'assigned') {
      throw new BadRequestException(
        `Cannot start a job in status '${job.status}'`,
      );
    }
    const updated = await this.setStatus(jobId, 'in_progress');
    await this.notify(job.client_id, 'job_update', 'Work started', {
      body: `${user.full_name} started working on "${job.title}".`,
      job_id: jobId,
    });
    return updated;
  }

  /** Client confirms completion; DB trigger updates provider stats + ML labels. */
  async complete(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    if (job.client_id !== user.id) throw new ForbiddenException('Not your job');
    if (job.status !== 'in_progress') {
      throw new BadRequestException(
        `Cannot complete a job in status '${job.status}'`,
      );
    }
    const updated = await this.setStatus(jobId, 'completed');
    // Pay the provider out of escrow. No-ops when the job had no budget, and
    // deliberately skips a disputed escrow — that needs an admin decision.
    await this.escrow.release(jobId);
    await this.notify(job.assigned_provider_id, 'job_update', 'Job completed', {
      body: `The client marked "${job.title}" as completed.`,
      job_id: jobId,
    });
    return updated;
  }

  private async findJob(jobId: string) {
    const { data, error } = await this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Job not found');
    return data;
  }

  private async setStatus(jobId: string, status: string) {
    const { data, error } = await this.supabase.admin
      .from('jobs')
      .update({ status })
      .eq('id', jobId)
      .select(JOB_SELECT)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  private async notify(
    recipientId: string,
    type: string,
    title: string,
    payload: { body: string; job_id: string },
  ) {
    await this.supabase.admin.from('notifications').insert({
      recipient_id: recipientId,
      type,
      title,
      body: payload.body,
      data: { job_id: payload.job_id },
    });
  }
}
