import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { EscrowService } from '../escrow/escrow.service';
import {
  BrowseJobsQueryDto,
  CreateJobDto,
  DeclineJobDto,
  UpdateJobTaskDto,
} from './dto/jobs.dto';
import type { Profile } from '../common/types';

const URGENCY_RANK: Record<string, number> = {
  urgent: 0,
  normal: 1,
  flexible: 2,
};

const DEFAULT_RADIUS_KM = 50;
const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between two lat/lng points. */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// The assigned-provider embed needs the FK hint: jobs has two FKs to profiles
// (client_id and assigned_provider_id). Mobile's My Jobs list renders this name.
// Keep this a single string literal — concatenating widens the type to `string`
// and supabase-js can no longer infer the row shape from it.
//
// job_tasks rides along on every job read: the provider's job screen is the
// checklist, so fetching it separately would only buy a second round trip.
const JOB_SELECT =
  '*, service_categories(name), assigned_provider:profiles!jobs_assigned_provider_id_fkey(id, full_name), job_tasks(id, label, position, is_done, completed_at)';

/** The one status an incoming booking request can be accepted from. */
const AWAITING_PROVIDER_ANSWER = ['assigned'];

/**
 * The provider holds the job but has not begun: they may start it or back out
 * of it. 'assigned' is included alongside 'confirmed' so a provider can start
 * work in one go without a separate accept, and so jobs assigned before
 * migration 0018 — which never had a confirmation step to pass through — are
 * not stranded.
 */
const PRE_START = ['assigned', 'confirmed'];

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

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

    if (dto.tasks?.length) {
      const jobId = (data as { id: string }).id;
      const { error: taskError } = await this.supabase.admin
        .from('job_tasks')
        .insert(
          dto.tasks.map((label, position) => ({
            job_id: jobId,
            label,
            position,
          })),
        );
      // The job itself posted fine. Failing the whole request now would leave
      // the client staring at an error for a job that does exist, so the
      // checklist is dropped and the job comes back as it was truly stored.
      if (taskError) {
        this.logger.error(
          `Job ${jobId} created without its checklist: ${taskError.message}`,
        );
        return data;
      }
      return this.findJob(jobId);
    }

    return data;
  }

  /**
   * Provider browse: open/recommending jobs, filtered to those within
   * `radius_km` of the provider's location (when lat/lng are given) and
   * sorted by urgency then distance, newest first as the final tie-break.
   * Filtering/sorting happens in JS since distance isn't a plain column.
   */
  async browse(query: BrowseJobsQueryDto) {
    let builder = this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .in('status', ['open', 'recommending'])
      .order('posted_at', { ascending: false });
    if (query.category_id)
      builder = builder.eq('category_id', query.category_id);
    const { data, error } = await builder;
    if (error) throw new BadRequestException(error.message);
    const jobs = data ?? [];

    const hasLocation = query.latitude != null && query.longitude != null;
    const radiusKm = query.radius_km ?? DEFAULT_RADIUS_KM;

    const withDistance = jobs.map((job: any) => ({
      job,
      distanceKm:
        hasLocation && job.latitude != null && job.longitude != null
          ? haversineKm(
              query.latitude!,
              query.longitude!,
              job.latitude,
              job.longitude,
            )
          : null,
    }));

    const filtered = hasLocation
      ? withDistance.filter(
          (j) => j.distanceKm === null || j.distanceKm <= radiusKm,
        )
      : withDistance;

    filtered.sort((a, b) => {
      const urgencyDiff =
        (URGENCY_RANK[a.job.urgency] ?? 1) - (URGENCY_RANK[b.job.urgency] ?? 1);
      if (urgencyDiff !== 0) return urgencyDiff;
      if (a.distanceKm !== null && b.distanceKm !== null) {
        const distDiff = a.distanceKm - b.distanceKm;
        if (distDiff !== 0) return distDiff;
      }
      return (
        new Date(b.job.posted_at).getTime() -
        new Date(a.job.posted_at).getTime()
      );
    });

    const summary = {
      open_count: filtered.length,
      urgent_count: filtered.filter((j) => j.job.urgency === 'urgent').length,
      potential_payout: filtered.reduce(
        (sum, j) => sum + (j.job.budget ?? 0),
        0,
      ),
    };

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const page = filtered
      .slice(offset, offset + limit)
      .map((j) => ({ ...j.job, distance_km: j.distanceKm }));

    return { jobs: page, summary };
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
      ![
        'open',
        'recommending',
        'assigned',
        'confirmed',
        'in_progress',
      ].includes(job.status)
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

  /**
   * The provider accepts an incoming booking request: 'assigned' (the client
   * hired them, awaiting an answer) → 'confirmed' (they have agreed to it).
   * The mirror of `decline()`, and the reason `decline()` needs a reason and
   * this does not — saying yes explains itself.
   *
   * No money moves: escrow was placed when the client hired them and is
   * released on completion or refunded on cancellation, exactly as before.
   */
  async accept(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    if (job.assigned_provider_id !== user.id) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    if (!AWAITING_PROVIDER_ANSWER.includes(job.status)) {
      throw new BadRequestException(
        job.status === 'confirmed'
          ? 'You have already accepted this booking'
          : `Cannot accept a job in status '${job.status}'`,
      );
    }
    const updated = await this.setStatus(jobId, 'confirmed');
    await this.notify(job.client_id, 'job_update', 'Booking confirmed', {
      body: `${user.full_name} accepted your booking for "${job.title}".`,
      job_id: jobId,
    });
    return updated;
  }

  /** Assigned provider marks work started. */
  async start(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    if (job.assigned_provider_id !== user.id) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    if (!PRE_START.includes(job.status)) {
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

  /**
   * Assigned provider declines a booking before starting work — the mirror
   * of `cancel()` but provider-initiated and reason-required. Valid pre-start,
   * whether or not they had already accepted: plans change between confirming
   * a job and turning up for it, and a provider who backs out then should say
   * so here rather than silently not appearing. Once work has started,
   * cancellation goes through the client (a dispute, if contested).
   */
  async decline(user: Profile, jobId: string, dto: DeclineJobDto) {
    const job = await this.findJob(jobId);
    if (job.assigned_provider_id !== user.id) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    if (!PRE_START.includes(job.status)) {
      throw new BadRequestException(
        `Cannot decline a job in status '${job.status}'`,
      );
    }
    const updated = await this.setStatus(jobId, 'cancelled');
    // Release the hold back to the client, same as a client-initiated cancel.
    await this.escrow.cancelForJob(jobId);
    await this.notify(job.client_id, 'job_update', 'Booking declined', {
      body: `${user.full_name} declined "${job.title}": ${dto.reason}`,
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

  /**
   * The assigned provider ticks a checklist item off (or back on). Returns the
   * whole job so the caller's screen re-renders from one source of truth
   * rather than patching a task into a list it already held.
   *
   * Allowed from 'confirmed' and 'in_progress' only: before the provider has
   * accepted there is nothing to report progress on, and after the client has
   * closed the job the checklist is a record of what happened, not a live
   * document.
   */
  async updateTask(
    user: Profile,
    jobId: string,
    taskId: string,
    dto: UpdateJobTaskDto,
  ) {
    const job = await this.findJob(jobId);
    if (job.assigned_provider_id !== user.id) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    if (!['confirmed', 'in_progress'].includes(job.status)) {
      throw new BadRequestException(
        `Cannot update the checklist of a job in status '${job.status}'`,
      );
    }

    const { data, error } = await this.supabase.admin
      .from('job_tasks')
      .update({
        is_done: dto.is_done,
        // chk_job_tasks_done_timestamp keeps these two in step.
        completed_at: dto.is_done ? new Date().toISOString() : null,
      })
      .eq('id', taskId)
      .eq('job_id', jobId)
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Task not found on this job');

    return this.findJob(jobId);
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
