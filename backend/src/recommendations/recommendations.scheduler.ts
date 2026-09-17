import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isExternallyScheduled } from '../common/cron-driver';
import { SupabaseService } from '../supabase/supabase.service';
import { RecommendationsService } from './recommendations.service';

/** Jobs with no accepted application this long after posting become 'expired' (schema §7). */
const EXPIRY_HOURS = 24;

/**
 * How long a job must have sat in 'recommending' before the sweep retries its
 * scoring. Keeps the retry off a job that a manual trigger or this same tick
 * has only just moved there, and is still scoring (BACKEND_SCHEMA.md §32).
 */
const RETRY_AFTER_MS = 60_000;

/** Per-tick cap, like the timeout sweep's, so a backlog cannot stall a tick. */
const RETRY_BATCH = 20;

/**
 * Replaces the schema's pg_cron suggestion with an in-process scheduler
 * (implementer's choice per §9): every minute, timed-out open jobs move to
 * 'recommending' and get scored, and stale unassigned jobs expire.
 */
@Injectable()
export class RecommendationsScheduler {
  private readonly logger = new Logger(RecommendationsScheduler.name);
  private running = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly recommendations: RecommendationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledTick() {
    if (isExternallyScheduled()) return;
    await this.tick();
  }

  /**
   * The sweep itself, shared by the `@Cron` above and
   * POST /internal/tick/recommendations so the two drivers cannot drift.
   */
  async tick() {
    if (this.running) return; // skip overlapping ticks
    this.running = true;
    try {
      await this.processTimeouts();
      await this.retryUnscoredJobs();
      await this.expireStaleJobs();
    } catch (err) {
      this.logger.error(`Scheduler tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async processTimeouts() {
    const { data: jobs, error } = await this.supabase.admin
      .from('jobs')
      .select('id, title')
      .eq('status', 'open')
      .lt('recommendation_deadline', new Date().toISOString())
      .limit(20);
    // Surfaced rather than discarded. A read that fails means no job ever
    // reaches 'recommending' again, and swallowing the error made that
    // indistinguishable from a genuinely quiet minute — the sweep would go on
    // reporting nothing for as long as the fault lasted. `tick()` catches this
    // and logs it, so the schedule survives while the failure is visible.
    if (error) {
      throw new Error(`Could not read timed-out jobs: ${error.message}`);
    }

    for (const job of jobs ?? []) {
      // Flip status first so the timeout path runs at most once per job (§7).
      const { data: flipped } = await this.supabase.admin
        .from('jobs')
        .update({ status: 'recommending' })
        .eq('id', job.id)
        .eq('status', 'open')
        .select('id')
        .maybeSingle();
      if (!flipped) continue;

      try {
        await this.recommendations.scoreJob(job.id, job.title, 'timeout');
      } catch (err) {
        // Job stays 'recommending'; providers can still apply organically and
        // the client can retry via the manual trigger endpoint.
        this.logger.error(
          `Scoring failed for job ${job.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * A job that reached 'recommending' but has no recommendation run was never
   * scored: ml-service failed or timed out, or nobody was eligible yet. The
   * timeout sweep above only reads 'open' jobs, so without this it would wait
   * forever for the client to press retry. Retried every tick until a run
   * exists or the job leaves 'recommending' — which also means a provider who
   * becomes eligible later (verifies, sets an address) still gets invited
   * before the job expires.
   */
  private async retryUnscoredJobs() {
    const { data: jobs, error } = await this.supabase.admin
      .from('jobs')
      .select('id, title')
      .eq('status', 'recommending')
      .lt('updated_at', new Date(Date.now() - RETRY_AFTER_MS).toISOString())
      .order('updated_at', { ascending: true })
      .limit(RETRY_BATCH);
    if (error) {
      throw new Error(`Could not read unscored jobs: ${error.message}`);
    }
    if (!jobs || jobs.length === 0) return;

    const { data: runs, error: runsError } = await this.supabase.admin
      .from('recommendation_runs')
      .select('job_id')
      .in(
        'job_id',
        jobs.map((j) => j.id),
      );
    if (runsError) {
      throw new Error(
        `Could not read recommendation runs: ${runsError.message}`,
      );
    }
    const scored = new Set((runs ?? []).map((r) => r.job_id as string));

    for (const job of jobs.filter((j) => !scored.has(j.id))) {
      try {
        await this.recommendations.scoreJob(job.id, job.title, 'timeout');
      } catch (err) {
        this.logger.error(
          `Scoring retry failed for job ${job.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async expireStaleJobs() {
    const cutoff = new Date(
      Date.now() - EXPIRY_HOURS * 3600 * 1000,
    ).toISOString();
    const { data: expired, error } = await this.supabase.admin
      .from('jobs')
      .update({ status: 'expired' })
      .in('status', ['open', 'recommending'])
      .lt('posted_at', cutoff)
      .select('id');
    if (error) {
      throw new Error(`Could not expire stale jobs: ${error.message}`);
    }
    if (expired && expired.length > 0) {
      this.logger.log(
        `Expired ${expired.length} unassigned job(s) older than ${EXPIRY_HOURS}h`,
      );
    }
  }
}
