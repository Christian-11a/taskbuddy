import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { EscrowService, WARRANTY_DURATION_MS } from '../escrow/escrow.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import {
  AcceptJobDto,
  BrowseJobsQueryDto,
  MineJobsQueryDto,
  CreateJobDto,
  DeclineJobDto,
  ProposeJobChangeDto,
  DecideJobChangeDto,
  UpdateJobTaskDto,
  PriceEstimateDto,
} from './dto/jobs.dto';
import type { JobUrgency, Profile } from '../common/types';
import { priceFor, priceOptions } from './pricing';
import type { PriceTier, TaskEffort } from './pricing';

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
//
// reviews rides along too, for the same reason: "has the client already
// reviewed this?" is a question every completed-job screen asks, and without
// the answer on the payload the only way to find out was to submit a second
// review and read the error. `reviews.job_id` is UNIQUE, so this embed is
// one-to-one.
const JOB_SELECT =
  '*, service_categories(name), assigned_provider:profiles!jobs_assigned_provider_id_fkey(id, full_name), job_tasks(id, label, position, is_done, completed_at), reviews(id, rating, comment, created_at)';

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

/** Every state a client may still cancel from. */
const CANCELLABLE = [
  'open',
  'recommending',
  'assigned',
  'confirmed',
  'in_progress',
];

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
    private readonly escrow: EscrowService,
    private readonly geocoding: GeocodingService,
  ) {}

  /** Category base rate and urgency multiplier for the pricing formula. */
  private async pricingRates(categoryId: number, urgency: JobUrgency) {
    const [category, setting] = await Promise.all([
      this.supabase.admin
        .from('service_categories')
        .select('base_price')
        .eq('id', categoryId)
        .maybeSingle(),
      this.supabase.admin
        .from('urgency_settings')
        .select('price_multiplier')
        .eq('urgency', urgency)
        .maybeSingle(),
    ]);
    if (category.error) throw new BadRequestException(category.error.message);
    if (!category.data) throw new BadRequestException('Unknown category');
    return {
      basePrice: Number(category.data.base_price),
      urgencyMultiplier: Number(setting.data?.price_multiplier ?? 1),
    };
  }

  /** What the job would cost at another tier, from its stored checklist. */
  private async tierPriceForJob(jobId: string, tier: PriceTier) {
    const { data: job, error } = await this.supabase.admin
      .from('jobs')
      .select('category_id, urgency, job_tasks(effort)')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!job) throw new NotFoundException('Job not found');
    const rates = await this.pricingRates(job.category_id, job.urgency);
    const efforts = (job.job_tasks ?? []).map(
      (t: { effort: TaskEffort }) => t.effort,
    );
    return priceFor({ ...rates, efforts }, tier);
  }

  async estimatePrice(dto: PriceEstimateDto) {
    const rates = await this.pricingRates(
      dto.category_id,
      dto.urgency ?? 'normal',
    );
    return {
      options: priceOptions({ ...rates, efforts: dto.task_efforts ?? [] }),
    };
  }

  async create(user: Profile, dto: CreateJobDto) {
    const tasks = dto.tasks ?? [];
    const efforts: TaskEffort[] = tasks.map(
      (_, i) => dto.task_efforts?.[i] ?? 'moderate',
    );
    const urgency = dto.urgency ?? 'normal';
    const rates = await this.pricingRates(dto.category_id, urgency);
    const budget = priceFor({ ...rates, efforts }, dto.price_tier);
    const location = await this.geocoding.geocode(dto.address);
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
        urgency,
        address: dto.address,
        latitude: location.latitude,
        longitude: location.longitude,
        budget,
        price_tier: dto.price_tier,
        scheduled_at: dto.scheduled_at ?? null,
        photo_urls: dto.photo_urls ?? [],
        // recommendation_deadline is filled in by the DB trigger; the column is
        // NOT NULL so send a placeholder the trigger overwrites.
        recommendation_deadline: new Date().toISOString(),
      })
      .select(JOB_SELECT)
      .single();
    if (error?.code === 'TB409') throw new ConflictException(error.message);
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
            effort: efforts[position],
          })),
        );
      // The job itself posted fine. Failing the whole request now would leave
      // the client staring at an error for a job that does exist, so the
      // checklist is dropped and the job comes back as it was truly stored.
      if (taskError) {
        this.logger.error(
          `Job ${jobId} created without its checklist: ${taskError.message}`,
        );
        return this.withReview(data);
      }
      return this.findJob(jobId);
    }

    return this.withReview(data);
  }

  /**
   * Provider browse: open/recommending jobs, filtered to those within
   * `radius_km` of the provider's location (when lat/lng are given) and
   * sorted by urgency then distance, newest first as the final tie-break.
   * Filtering/sorting happens in JS since distance isn't a plain column.
   */
  async browse(query: BrowseJobsQueryDto, user: Profile) {
    const { data: skills, error: skillsError } = await this.supabase.admin.rpc(
      'provider_approved_categories',
      { p_provider_id: user.id },
    );
    if (skillsError) throw new BadRequestException(skillsError.message);
    const categoryIds = (skills as { category_id: number }[]).map(
      (s) => s.category_id,
    );
    if (!categoryIds.length)
      return {
        jobs: [],
        summary: { open_count: 0, urgent_count: 0, potential_payout: 0 },
      };
    let builder = this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .in('status', ['open', 'recommending'])
      .in('category_id', categoryIds)
      .order('posted_at', { ascending: false });
    if (query.category_id)
      builder = builder.eq('category_id', query.category_id);
    if (query.urgency) builder = builder.eq('urgency', query.urgency);
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
    const page = this.withReviews(
      filtered
        .slice(offset, offset + limit)
        .map((j) => ({ ...j.job, distance_km: j.distanceKm })),
    );

    return { jobs: page, summary };
  }

  async mine(user: Profile, dto: MineJobsQueryDto = {}) {
    let query = this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .eq('client_id', user.id);
    if (dto.category_id !== undefined)
      query = query.eq('category_id', dto.category_id);
    if (dto.status_group !== undefined) {
      const statuses = {
        active: ['open', 'recommending'],
        ongoing: ['assigned', 'confirmed', 'in_progress'],
        completed: ['completed'],
        cancelled: ['cancelled', 'expired'],
      };
      query = query.in('status', statuses[dto.status_group]);
    }
    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (dto.limit !== undefined || dto.offset !== undefined) {
      const offset = dto.offset ?? 0;
      query = query.range(offset, offset + (dto.limit ?? 100) - 1);
    }
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return this.withReviews(data ?? []);
  }

  async assigned(user: Profile) {
    const { data } = await this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .eq('assigned_provider_id', user.id)
      .order('assigned_at', { ascending: false });
    return this.withReviews(data ?? []);
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
    // Only the job's own two people learn about its money.
    if (!isOwner && !isAssigned) return job;
    return { ...job, escrow: await this.escrowSummary(jobId) };
  }

  /** Client cancels from any pre-completion state. */
  async cancel(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    if (job.client_id !== user.id) throw new ForbiddenException('Not your job');
    if (job.status === 'cancelled') return job;
    if (!CANCELLABLE.includes(job.status)) {
      throw new BadRequestException(
        `Cannot cancel a job in status '${job.status}'`,
      );
    }
    const updated = await this.setStatus(jobId, 'cancelled', CANCELLABLE, {
      cancelled_by: user.id,
    });
    // Release the hold. A disputed escrow is left for an admin to resolve.
    await this.escrow.cancelForJob(jobId);
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
  async accept(user: Profile, jobId: string, dto: AcceptJobDto = {}) {
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
    const hasLocation =
      dto.address != null && dto.latitude != null && dto.longitude != null;
    const updated = await this.setStatus(
      jobId,
      'confirmed',
      AWAITING_PROVIDER_ANSWER,
      hasLocation
        ? {
            provider_accept_address: dto.address,
            provider_accept_latitude: dto.latitude,
            provider_accept_longitude: dto.longitude,
          }
        : undefined,
    );
    await this.ensureBooking(job);
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
    const updated = await this.setStatus(jobId, 'in_progress', PRE_START);
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
    const updated = await this.setStatus(jobId, 'cancelled', PRE_START, {
      cancelled_by: user.id,
    });
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
    if (job.job_tasks.some((task) => !task.is_done)) {
      throw new BadRequestException(
        'The provider must finish the task checklist before you confirm completion',
      );
    }
    await this.setStatus(jobId, 'completed', ['in_progress']);
    // The payments sweep releases escrow after the 72-hour warranty.
    await this.notify(job.assigned_provider_id, 'job_update', 'Job completed', {
      body:
        Number(job.budget) > 0
          ? `The client marked "${job.title}" as completed. Payment stays held for the three-day warranty; an open dispute blocks release.`
          : `The client marked "${job.title}" as completed. The three-day warranty has started.`,
      job_id: jobId,
    });
    // The AFTER UPDATE trigger stamps completed_at in a second update, which
    // is not included in the original UPDATE RETURNING row.
    return this.findJob(jobId);
  }

  async releasePayment(user: Profile, jobId: string) {
    const escrow = await this.escrow.releaseEarly(jobId, user.id);
    const job = await this.findJob(jobId);
    return { job, escrow };
  }

  async requestPaymentRelease(user: Profile, jobId: string) {
    const { data, error } = await this.supabase.admin.rpc(
      'request_early_payment_release',
      { p_job_id: jobId, p_provider_id: user.id },
    );
    if (error?.code === 'TB409')
      throw new ConflictException({
        message: error.message,
        next_allowed_at: error.details || null,
      });
    if (error?.code === 'TB403') throw new ForbiddenException(error.message);
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async listPaymentReleaseRequests(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    if (user.id !== job.client_id && user.id !== job.assigned_provider_id)
      throw new ForbiddenException('Not a participant in this job');
    const { data, error } = await this.supabase.admin
      .from('provider_release_requests')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async listChanges(user: Profile, jobId: string) {
    const job = await this.findJob(jobId);
    if (user.id !== job.client_id && user.id !== job.assigned_provider_id)
      throw new ForbiddenException('Not a participant in this job');
    const { error: expiryError } = await this.supabase.admin.rpc(
      'job_change_expire',
      {
        p_job_id: jobId,
      },
    );
    if (expiryError) throw new BadRequestException(expiryError.message);
    const { data, error } = await this.supabase.admin
      .from('job_change_requests')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async proposeChange(user: Profile, jobId: string, dto: ProposeJobChangeDto) {
    const newBudget =
      dto.type === 'price' && dto.new_price_tier
        ? await this.tierPriceForJob(jobId, dto.new_price_tier)
        : null;
    const { data, error } = await this.supabase.admin.rpc(
      'job_change_propose',
      {
        p_job_id: jobId,
        p_actor: user.id,
        p_type: dto.type,
        p_schedule: dto.new_scheduled_at ?? null,
        p_budget: newBudget,
        p_reason: dto.reason,
      },
    );
    if (error?.code === 'TB409' || error?.code === '23505')
      throw new ConflictException(error.message);
    if (error?.code === 'TB403') throw new ForbiddenException(error.message);
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async decideChange(
    user: Profile,
    requestId: string,
    dto: DecideJobChangeDto,
  ) {
    const { data, error } = await this.supabase.admin.rpc('job_change_decide', {
      p_request_id: requestId,
      p_actor: user.id,
      p_decision: dto.decision,
    });
    if (error?.code === 'TB409') throw new ConflictException(error.message);
    if (error?.code === 'TB403') throw new ForbiddenException(error.message);
    if (error?.code === 'TB404') throw new NotFoundException(error.message);
    if (error) throw new BadRequestException(error.message);
    // A price decrease credited the difference; send it back to the client's
    // payment method now (migration 0057). A no-op for anything else.
    const { data: job } = await this.supabase.admin
      .from('job_change_requests')
      .select('jobs(client_id)')
      .eq('id', requestId)
      .maybeSingle();
    const clientId = (job as { jobs?: { client_id?: string } } | null)?.jobs
      ?.client_id;
    if (clientId) await this.escrow.passThrough([clientId]);
    return data;
  }

  /**
   * The assigned provider ticks a checklist item off (or back on). Returns the
   * whole job so the caller's screen re-renders from one source of truth
   * rather than patching a task into a list it already held.
   *
   * Allowed only after Start Job: before work starts there is no progress
   * to report, and after the client has
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
    if (job.status !== 'in_progress') {
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

  /**
   * Normalises the embedded review into the two fields callers actually want.
   *
   * PostgREST returns a one-to-one embed as an object, but returns an array
   * when it cannot see the uniqueness (an older schema cache, say). Both
   * shapes are flattened here so no screen has to know which it got, and
   * `has_review` is spelled out rather than left as "check whether `review` is
   * truthy" — the flag is the thing the UI branches on.
   */
  private withReview<T>(job: T): T {
    const row = job as Record<string, unknown>;
    const embedded = row.reviews;
    const review = Array.isArray(embedded)
      ? ((embedded[0] as Record<string, unknown> | undefined) ?? null)
      : ((embedded as Record<string, unknown> | null) ?? null);
    const { reviews: _dropped, ...rest } = row;
    const photoUrls = (row.photo_urls as string[] | null) ?? [];
    return {
      ...rest,
      photo_urls: photoUrls.map((path) =>
        /^https?:\/\//i.test(path)
          ? path
          : this.supabase.admin.storage.from('job-photos').getPublicUrl(path)
              .data.publicUrl,
      ),
      review,
      has_review: review !== null,
      warranty_expires_at:
        row.status === 'completed' && row.completed_at
          ? new Date(
              new Date(row.completed_at as string).getTime() +
                WARRANTY_DURATION_MS,
            ).toISOString()
          : null,
    } as T;
  }

  private withReviews<T>(jobs: T[]): T[] {
    return jobs.map((job) => this.withReview(job));
  }

  /**
   * Is a payment held for this job, and was it paid from the wallet or by card?
   * Job Details needs both: early release is offered only while money is held,
   * and price changes only for wallet-funded jobs. A failed lookup reads as
   * unknown (null) rather than failing the whole job read.
   */
  private async escrowSummary(
    jobId: string,
  ): Promise<{ status: string; funding_method: 'wallet' | 'card' } | null> {
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .select('status, funding_method')
      .eq('job_id', jobId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`escrow summary for job ${jobId}: ${error.message}`);
      return null;
    }
    return data ?? null;
  }

  private async findJob(jobId: string) {
    const { data, error } = await this.supabase.admin
      .from('jobs')
      .select(JOB_SELECT)
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Job not found');
    return this.withReview(data);
  }

  /**
   * Moves a job on, but only from a status the caller already checked it was
   * in. The check before this call reads the row; this re-asserts it in the
   * WHERE clause, because two requests arriving together — a client's Cancel
   * and their own Complete, or a Cancel racing the provider's Decline — both
   * pass the read. Without the re-assertion both would "win" at the job level
   * while escrow settled only one way, leaving a completed job whose money
   * went back to the client, or a cancelled one that paid the provider.
   */
  private async setStatus(
    jobId: string,
    status: string,
    from: string[],
    extra?: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabase.admin
      .from('jobs')
      .update({ status, ...extra })
      .eq('id', jobId)
      .in('status', from)
      .select(JOB_SELECT)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new ConflictException(
        'This job changed while you were acting on it. Refresh and try again.',
      );
    }
    return this.withReview(data);
  }

  /**
   * Puts a confirmed booking on the provider's calendar. Hiring only creates a
   * booking when the client picked a time (0007's trigger), so an ASAP job
   * never reached the calendar at all; it lands on the day it was confirmed.
   * The unique job_id makes a repeat a no-op, and a failure here must not
   * undo an accept that already succeeded.
   */
  private async ensureBooking(job: {
    id: string;
    client_id: string;
    assigned_provider_id: string | null;
    scheduled_at?: string | null;
  }) {
    const { error } = await this.supabase.admin.from('bookings').insert({
      job_id: job.id,
      provider_id: job.assigned_provider_id,
      client_id: job.client_id,
      scheduled_at: job.scheduled_at ?? new Date().toISOString(),
    });
    if (error && error.code !== '23505') {
      this.logger.warn(
        `Could not add job ${job.id} to the calendar: ${error.message}`,
      );
    }
  }

  private async notify(
    recipientId: string,
    type: string,
    title: string,
    payload: { body: string; job_id: string },
  ) {
    const { error: notificationError } = await this.supabase.admin
      .from('notifications')
      .insert({
        recipient_id: recipientId,
        type,
        title,
        body: payload.body,
        data: { job_id: payload.job_id },
      });
    if (notificationError)
      this.logger.error(
        `Notification not written: ${notificationError.message}`,
      );
  }
}
