import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

/** How many top-ranked providers get an invite notification (schema §2, N = 8). */
const TOP_N = 8;

interface FeatureRow {
  provider_id: string;
  skills_match: number;
  distance_km: number;
  provider_avg_rating: number;
  provider_completed_jobs: number;
  provider_availability: number;
  job_idle_duration_hrs: number;
  provider_response_time_hrs: number;
  provider_years_experience: number;
  hour_posted: number;
  provider_skill_category: string;
  day_of_week: string;
  job_urgency: string;
  job_description: string;
  provider_bio: string;
}

/** Two attempts and the retry delay fit inside mobile's 90 s request timeout. */
const ML_SCORE_ATTEMPT_TIMEOUT_MS = 35_000;
const ML_SCORE_RETRY_DELAY_MS = 2_000;
const MATCHING_UNAVAILABLE_MESSAGE =
  'The matching service is waking up. Try again in a minute.';
const RETRYABLE_MODEL_STATUSES = new Set([429, 502, 503, 504]);

/** Scheme + host only: never log a path or credentials from the configured URL. */
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '(invalid ML_SERVICE_URL)';
  }
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly mlServiceUrl: string;

  constructor(
    private readonly supabase: SupabaseService,
    config: ConfigService,
  ) {
    this.mlServiceUrl = config.get<string>(
      'ML_SERVICE_URL',
      'http://localhost:8000',
    );
  }

  /** Client manually re-triggers scoring for their own job. */
  async triggerManual(user: Profile, jobId: string) {
    const { data: job } = await this.supabase.admin
      .from('jobs')
      .select('id, title, status, client_id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new NotFoundException('Job not found');
    if (job.client_id !== user.id) throw new ForbiddenException('Not your job');
    if (!['open', 'recommending'].includes(job.status)) {
      throw new BadRequestException(
        `Cannot run recommendations for a '${job.status}' job`,
      );
    }
    // Stamp the attempt either way, so the scheduler's retry sweep leaves this
    // job alone while it scores (BACKEND_SCHEMA.md §32.3).
    const { data: claimed } = await this.supabase.admin
      .from('jobs')
      .update({
        status: 'recommending',
        recommendation_attempted_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      // Re-checked here, so a hire landing since the read above is neither
      // pulled back to 'recommending' nor sent a fresh round of invites.
      .in('status', ['open', 'recommending'])
      .select('id')
      .maybeSingle();
    if (!claimed) {
      throw new BadRequestException(
        'This job is no longer looking for providers',
      );
    }
    return this.scoreJob(jobId, job.title, 'manual');
  }

  /**
   * Full scoring run for one job (schema §9): build the pool via
   * fn_job_provider_features, score with the model service, persist the run,
   * all candidates with their frozen feature snapshots, and invite the top N.
   */
  async scoreJob(
    jobId: string,
    jobTitle: string,
    triggeredBy: 'timeout' | 'manual',
  ) {
    const { data: features, error: rpcError } = await this.supabase.admin.rpc(
      'fn_job_provider_features',
      { p_job_id: jobId },
    );
    if (rpcError) {
      this.logger.error(
        `Feature RPC failed for job ${jobId}: ${rpcError.message}`,
      );
      throw new BadRequestException(rpcError.message);
    }
    const pool = (features ?? []) as FeatureRow[];
    if (pool.length === 0) {
      this.logger.warn(
        `Job ${jobId}: eligible provider pool is empty, no run recorded`,
      );
      return { run_id: null, pool_size: 0, notified: 0 };
    }

    const { model_version, scores } = await this.callModelService(pool);

    const { data: run, error: runError } = await this.supabase.admin
      .from('recommendation_runs')
      .insert({
        job_id: jobId,
        triggered_by: triggeredBy,
        model_version,
        pool_size: pool.length,
      })
      .select()
      .single();
    if (runError) throw new BadRequestException(runError.message);

    const ranked = pool
      .map((row, i) => ({ row, score: scores[i] }))
      .sort((a, b) => b.score - a.score);

    // Scoring is asynchronous: a certificate may have expired or been rejected
    // since the pool was read. Re-check eligibility (the same live
    // provider_approved_categories rule behind the pool) right before choosing
    // who is invited, and skip anyone no longer eligible.
    const { data: fresh, error: freshError } = await this.supabase.admin.rpc(
      'fn_job_provider_features',
      { p_job_id: jobId },
    );
    if (freshError) throw new BadRequestException(freshError.message);
    const stillEligible = new Set(
      ((fresh ?? []) as FeatureRow[]).map((r) => r.provider_id),
    );
    const invitees = ranked
      .filter(({ row }) => stillEligible.has(row.provider_id))
      .slice(0, TOP_N);
    const inviteeIds = new Set(invitees.map(({ row }) => row.provider_id));

    const now = new Date().toISOString();
    const candidates = ranked.map(({ row, score }, i) => ({
      run_id: run.id,
      provider_id: row.provider_id,
      rank: i + 1,
      score: Number(score.toFixed(5)),
      notified_at: inviteeIds.has(row.provider_id) ? now : null,
      skills_match: row.skills_match,
      distance_km: row.distance_km,
      provider_avg_rating: row.provider_avg_rating,
      provider_completed_jobs: row.provider_completed_jobs,
      provider_availability: row.provider_availability,
      job_idle_duration_hrs: row.job_idle_duration_hrs,
      provider_response_time_hrs: row.provider_response_time_hrs,
      provider_years_experience: row.provider_years_experience,
      hour_posted: row.hour_posted,
      provider_skill_category: row.provider_skill_category,
      day_of_week: row.day_of_week,
      job_urgency: row.job_urgency,
      job_description: row.job_description,
      provider_bio: row.provider_bio,
    }));

    const { error: candidatesError } = await this.supabase.admin
      .from('recommendation_candidates')
      .insert(candidates);
    if (candidatesError) throw new BadRequestException(candidatesError.message);

    let notified = 0;
    if (invitees.length > 0) {
      const { error: notificationError } = await this.supabase.admin
        .from('notifications')
        .insert(
          invitees.map(({ row }) => ({
            recipient_id: row.provider_id,
            type: 'recommendation_invite',
            title: 'A job near you needs your skills',
            body: `You were matched to the job "${jobTitle}". Check it out and apply!`,
            data: { job_id: jobId, run_id: run.id },
          })),
        );
      if (notificationError)
        this.logger.error(
          `Notification not written: ${notificationError.message}`,
        );
      else notified = invitees.length;
    }

    this.logger.log(
      `Job ${jobId}: scored ${pool.length} providers (model ${model_version}), notified ${notified}`,
    );
    return {
      run_id: run.id,
      pool_size: pool.length,
      notified,
    };
  }

  private async callModelService(
    pool: FeatureRow[],
  ): Promise<{ model_version: string; scores: number[] }> {
    // The model service expects the 14 features only, without provider_id.
    const records = pool.map(
      ({ provider_id: _ignored, ...features }) => features,
    );
    // The origin names the host in every failure, so a misrouted
    // ML_SERVICE_URL (HANDOFF.md §9) is visible in the logs rather than
    // looking like the scorer itself is down.
    const origin = safeOrigin(this.mlServiceUrl);
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${this.mlServiceUrl}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records }),
          // A hung scorer must not hold the scheduler's running flag. Two
          // bounded attempts also leave time for mobile to receive the 503.
          signal: AbortSignal.timeout(ML_SCORE_ATTEMPT_TIMEOUT_MS),
        });
      } catch (err) {
        const reason =
          (err as Error).name === 'TimeoutError'
            ? `timed out after ${ML_SCORE_ATTEMPT_TIMEOUT_MS / 1000}s`
            : (err as Error).message;
        const detail = `Model service at ${origin} unreachable: ${reason}`;
        if (attempt === 0) {
          this.logger.warn(`${detail}; retrying once`);
          await new Promise<void>((resolve) =>
            setTimeout(resolve, ML_SCORE_RETRY_DELAY_MS),
          );
          continue;
        }
        this.logger.error(detail);
        throw new ServiceUnavailableException(MATCHING_UNAVAILABLE_MESSAGE);
      }
      if (!response.ok) {
        const detail = `Model service at ${origin} returned ${response.status}: ${await response.text()}`;
        if (RETRYABLE_MODEL_STATUSES.has(response.status)) {
          if (attempt === 0) {
            this.logger.warn(`${detail}; retrying once`);
            await new Promise<void>((resolve) =>
              setTimeout(resolve, ML_SCORE_RETRY_DELAY_MS),
            );
            continue;
          }
          this.logger.error(detail);
          throw new ServiceUnavailableException(MATCHING_UNAVAILABLE_MESSAGE);
        }
        throw new Error(detail);
      }
      const body = (await response.json()) as {
        model_version: string;
        scores: number[];
      };
      if (!Array.isArray(body.scores) || body.scores.length !== pool.length) {
        throw new Error(
          'Model service returned a score array of the wrong length',
        );
      }
      return body;
    }
    throw new Error('Model service retry loop ended without a response');
  }
}
