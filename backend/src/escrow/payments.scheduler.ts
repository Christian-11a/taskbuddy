import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isExternallyScheduled } from '../common/cron-driver';
import { SupabaseService } from '../supabase/supabase.service';
import { EscrowService, WARRANTY_DURATION_MS } from './escrow.service';
import { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';
import { XenditService } from '../payments/xendit.service';

/** Cancelled jobs retain their existing two-minute reconciliation delay. */
const CANCEL_RECONCILE_AFTER_MS = 2 * 60 * 1000;

/** Releases expired warranties, reconciles cancellations, then retries card transfers.
 * Driven by the existing cron or POST /internal/tick/payments.
 */
@Injectable()
export class PaymentsScheduler {
  private readonly logger = new Logger(PaymentsScheduler.name);
  private running = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly escrow: EscrowService,
    private readonly payouts: ConnectPayoutsService,
    private readonly xendit: XenditService,
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
      await this.credentialExpiry();
      const { data: expired, error } = await this.supabase.admin.rpc(
        'expire_job_cancellations',
      );
      if (error)
        throw new Error(`Cancellation expiry failed: ${error.message}`);
      const { data: expiredChanges, error: changeError } =
        await this.supabase.admin.rpc('job_change_expire_all');
      if (changeError)
        throw new Error(`Job change expiry failed: ${changeError.message}`);
      const reconciled = await this.reconcileSettledJobs();
      const transfers = await this.payouts.sweep();
      // Anything a settlement left on the ledger (a dispute resolved in SQL,
      // a payout waiting for a linked account) is sent on here (0056).
      const { data: passedThrough, error: passError } =
        await this.supabase.admin.rpc('pass_through_balances', {
          p_profile_id: null,
          p_queue_provider_payouts: this.xendit.configured,
        });
      if (passError)
        this.logger.error(`Pass-through failed: ${passError.message}`);
      await this.escrow.sendQueuedPayouts();
      if (
        expired ||
        expiredChanges ||
        reconciled ||
        passedThrough ||
        transfers.transferred ||
        transfers.failed
      ) {
        this.logger.log(
          `Payments tick: ${expired} cancellation(s) expired, ${expiredChanges} job change(s) expired, ${reconciled} escrow(s) reconciled, ` +
            `${transfers.transferred} transfer(s) sent, ${transfers.failed} failed, ${passedThrough ?? 0} payout(s)/refund(s) passed through`,
        );
      }
    } catch (err) {
      this.logger.error(`Payments tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Certificate expiry (0068): 30-day warnings (once per credential), then
   * recompute is_verified for everyone and notify those who lost it. Cheap and
   * idempotent, so it rides this tick; its own failure never stops payments.
   */
  async credentialExpiry() {
    try {
      const { data, error } = await this.supabase.admin.rpc(
        'credential_expiry_tick',
      );
      if (error) throw new Error(error.message);
      const result = data as {
        warned?: number;
        expired?: number;
        changed?: number;
      } | null;
      if (result?.warned || result?.expired || result?.changed)
        this.logger.log(
          `Credential expiry: ${result.warned ?? 0} warned, ${result.expired ?? 0} expired, ${result.changed ?? 0} provider(s) changed`,
        );
    } catch (err) {
      this.logger.error(
        `Credential expiry tick failed: ${(err as Error).message}`,
      );
    }
  }

  /** Settles escrows left `held` on completed or cancelled jobs. Returns how many. */
  async reconcileSettledJobs(now = new Date()): Promise<number> {
    let settled = 0;
    for (const status of ['completed', 'cancelled'] as const) {
      const cutoff = new Date(
        now.getTime() -
          (status === 'completed'
            ? WARRANTY_DURATION_MS
            : CANCEL_RECONCILE_AFTER_MS),
      ).toISOString();
      const { data, error } = await this.supabase.admin
        .from('escrow_transactions')
        .select('id, job_id, jobs!inner(status, completed_at, updated_at)')
        .eq('status', 'held')
        .eq('jobs.status', status)
        .lte(
          status === 'completed' ? 'jobs.completed_at' : 'jobs.updated_at',
          cutoff,
        )
        .order('held_at', { ascending: true })
        .limit(50);
      if (error) throw new Error(`Reconcile read failed: ${error.message}`);

      for (const row of data ?? []) {
        try {
          // escrow_settle rechecks the warranty and open disputes under the
          // job lock. A complaint filed after this read still freezes payment.
          const moved =
            status === 'completed'
              ? await this.escrow.releaseIfHeld(row.job_id)
              : await this.escrow.cancelForJob(row.job_id);
          if (moved) settled++;
        } catch (err) {
          this.logger.error(
            `Could not reconcile escrow for job ${row.job_id}: ${(err as Error).message}`,
          );
        }
      }
    }
    return settled;
  }
}
