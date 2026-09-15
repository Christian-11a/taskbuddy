import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isExternallyScheduled } from '../common/cron-driver';
import { SupabaseService } from '../supabase/supabase.service';
import { EscrowService } from './escrow.service';
import { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';

/** How long a finished job's escrow may stay `held` before the sweep settles it. */
const RECONCILE_AFTER_MS = 2 * 60 * 1000;

/**
 * The money sweep (BACKEND_SCHEMA.md §29.6). Two jobs, both "finish what a
 * request started but could not":
 *
 * 1. **Card-funded payout transfers** left `pending` (the inline attempt in
 *    `EscrowService.payOut` hit a Stripe error it could not classify, or the
 *    process died mid-call) or `failed` with their backoff passed —
 *    `ConnectPayoutsService.sweep`.
 * 2. **Escrows still `held` on a job that is already completed or cancelled.**
 *    The job's status flip and the escrow move are two calls, and a failure
 *    between them (the release raised, the process restarted) used to leave
 *    the money held forever with nothing to retry it. Settling is
 *    conditional, so racing a live request is harmless — one of them moves the
 *    money and the other finds nothing to do.
 *
 * Driven the same two ways as the push and recommendation sweeps: an
 * in-process `@Cron`, or POST /internal/tick/payments from pg_cron (0029).
 */
@Injectable()
export class PaymentsScheduler {
  private readonly logger = new Logger(PaymentsScheduler.name);
  private running = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly escrow: EscrowService,
    private readonly payouts: ConnectPayoutsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledTick() {
    if (isExternallyScheduled()) return;
    await this.tick();
  }

  /** Shared by the `@Cron` and the HTTP tick; `running` makes an overlap harmless. */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const reconciled = await this.reconcileSettledJobs();
      const transfers = await this.payouts.sweep();
      if (reconciled || transfers.transferred || transfers.failed) {
        this.logger.log(
          `Payments tick: ${reconciled} escrow(s) reconciled, ` +
            `${transfers.transferred} transfer(s) sent, ${transfers.failed} failed`,
        );
      }
    } catch (err) {
      this.logger.error(`Payments tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Settles escrows left `held` on completed or cancelled jobs. Returns how many. */
  async reconcileSettledJobs(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RECONCILE_AFTER_MS).toISOString();
    const { data, error } = await this.supabase.admin
      .from('escrow_transactions')
      .select('id, job_id, jobs!inner(status, updated_at)')
      .eq('status', 'held')
      .in('jobs.status', ['completed', 'cancelled'])
      .lt('jobs.updated_at', cutoff)
      .limit(50);
    if (error) throw new Error(`Reconcile read failed: ${error.message}`);

    let settled = 0;
    // escrow → job is many-to-one, so PostgREST embeds an object; the
    // generated types say array, hence the cast and the tolerance of both.
    for (const row of (data ?? []) as unknown as {
      job_id: string;
      jobs: { status: string } | { status: string }[] | null;
    }[]) {
      const status = Array.isArray(row.jobs)
        ? row.jobs[0]?.status
        : row.jobs?.status;
      try {
        const moved =
          status === 'completed'
            ? await this.escrow.releaseIfHeld(row.job_id)
            : await this.escrow.cancelForJob(row.job_id);
        if (moved) {
          settled++;
          this.logger.warn(
            `Reconciled escrow for ${status} job ${row.job_id} ` +
              `that was still held`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Could not reconcile escrow for job ${row.job_id}: ${(err as Error).message}`,
        );
      }
    }
    return settled;
  }
}
