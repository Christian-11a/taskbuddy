import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isExternallyScheduled } from '../common/cron-driver';
import { SupabaseService } from '../supabase/supabase.service';
import { RecommendationsService } from './recommendations.service';

/** Jobs with no accepted application this long after posting become 'expired' (schema §7). */
const EXPIRY_HOURS = 24;

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
      await this.expireStaleJobs();
    } catch (err) {
      this.logger.error(`Scheduler tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async processTimeouts() {
    const { data: jobs } = await this.supabase.admin
      .from('jobs')
      .select('id, title')
      .eq('status', 'open')
      .lt('recommendation_deadline', new Date().toISOString())
      .limit(20);

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

  private async expireStaleJobs() {
    const cutoff = new Date(
      Date.now() - EXPIRY_HOURS * 3600 * 1000,
    ).toISOString();
    const { data: expired } = await this.supabase.admin
      .from('jobs')
      .update({ status: 'expired' })
      .in('status', ['open', 'recommending'])
      .lt('posted_at', cutoff)
      .select('id');
    if (expired && expired.length > 0) {
      this.logger.log(
        `Expired ${expired.length} unassigned job(s) older than ${EXPIRY_HOURS}h`,
      );
    }
  }
}
