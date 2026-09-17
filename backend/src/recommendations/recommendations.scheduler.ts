import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isExternallyScheduled } from '../common/cron-driver';
import { SupabaseService } from '../supabase/supabase.service';
import { RecommendationsService } from './recommendations.service';

/** Jobs with no accepted application this long after posting become 'expired' (schema §7). */
const EXPIRY_HOURS = 24;

/**
 * How long after a scoring attempt — the timeout flip, a manual trigger, or a
 * retry — before the sweep tries that job again (BACKEND_SCHEMA.md §32.3).
 * Longer than a scoring run can take with a cold ml-service on the free tier
 * (30–60 s to wake), so a retry never overlaps an attempt still in flight, and
 * slow enough that a job nobody is eligible for does not query every minute.
 */
const RETRY_AFTER_SECONDS = 300;

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
      // Stamping the attempt keeps the retry sweep off this job while it scores.
      const { data: flipped } = await this.supabase.admin
        .from('jobs')
        .update({
          status: 'recommending',
          recommendation_attempted_at: new Date().toISOString(),
        })
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
   * forever for the client to press retry. Retried every RETRY_AFTER_SECONDS
   * until a run exists or the job leaves 'recommending' — which also means a
   * provider who becomes eligible later (verifies, sets an address) still gets
   * invited before the job expires.
   *
   * Selection happens in SQL (`claim_unscored_recommending_jobs`, migration
   * 0032): it excludes jobs that already have a run *before* limiting, rotates
   * through a backlog by last attempt, and stamps each claimed job so a
   * concurrent tick or manual trigger does not score it twice.
   */
  private async retryUnscoredJobs() {
    const { data, error } = await this.supabase.admin.rpc(
      'claim_unscored_recommending_jobs',
      { p_retry_after_seconds: RETRY_AFTER_SECONDS, p_limit: RETRY_BATCH },
    );
    if (error) {
      throw new Error(`Could not claim unscored jobs: ${error.message}`);
    }
    const jobs = (data ?? []) as { id: string; title: string }[];

    for (const job of jobs) {
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
