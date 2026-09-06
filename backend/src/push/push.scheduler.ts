import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isExternallyScheduled } from '../common/cron-driver';
import { SupabaseService } from '../supabase/supabase.service';
import { SettingsService } from '../settings/settings.service';
import { PushService, type PushMessage } from './push.service';

/** Rows claimed per tick. Expo takes 100 per request; this is a few batches. */
const CLAIM_LIMIT = 200;

interface NotificationRow {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

/**
 * Delivers `notifications` rows to devices.
 *
 * Rows are written from several places — DB triggers on job and application
 * changes, plus services like verifications and escrow — so there is no single
 * call site to hang a "and also push it" line off. A sweep over
 * `pushed_at is null` catches all of them, including the ones Postgres writes
 * with no API request involved, and needs no coordination with any of them.
 *
 * In-process @Cron, consistent with RecommendationsScheduler and for the same
 * stated reason: no pg_cron/pg_net in this project.
 */
@Injectable()
export class PushScheduler {
  private readonly logger = new Logger(PushScheduler.name);
  private running = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly push: PushService,
    private readonly settings: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scheduledTick() {
    if (isExternallyScheduled()) return;
    await this.tick();
  }

  /**
   * The sweep itself, shared by the `@Cron` above and POST /internal/tick/push
   * so the two drivers cannot drift. The `running` flag makes an overlap
   * between them harmless rather than merely unlikely.
   */
  async tick() {
    if (this.running) return; // skip overlapping ticks
    this.running = true;
    try {
      await this.deliverPending();
    } catch (err) {
      this.logger.error(`Push tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async deliverPending() {
    const { data: pending } = await this.supabase.admin
      .from('notifications')
      .select('id, recipient_id, type, title, body, data')
      .is('pushed_at', null)
      .order('created_at', { ascending: true })
      .limit(CLAIM_LIMIT);

    const rows = (pending ?? []) as NotificationRow[];
    if (rows.length === 0) return;

    // Claim before sending, mirroring the status flip in
    // RecommendationsScheduler. The failure this trades against is asymmetric:
    // claiming first can drop a banner if the send then fails, while sending
    // first can re-push every notification in the backlog on the next tick if
    // the stamp fails. The row itself is never at risk either way — it stays in
    // the user's list, which is where the app reads notifications from.
    const ids = rows.map((r) => r.id);
    const { error: claimError } = await this.supabase.admin
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .in('id', ids);
    if (claimError) {
      this.logger.error(`Could not claim notifications: ${claimError.message}`);
      return;
    }

    const recipients = rows.map((r) => r.recipient_id);
    const [optedIn, tokensByProfile] = await Promise.all([
      this.settings.pushEnabledAmong(recipients),
      this.push.tokensFor(recipients),
    ]);

    const messages: PushMessage[] = [];
    for (const row of rows) {
      if (!optedIn.has(row.recipient_id)) continue;
      for (const token of tokensByProfile.get(row.recipient_id) ?? []) {
        messages.push({
          to: token,
          title: row.title,
          body: row.body ?? '',
          // Carries what the app needs to deep-link on tap. `type` tells it
          // which screen; `data` already holds the job/application id the
          // trigger recorded.
          data: {
            notification_id: row.id,
            type: row.type,
            ...(row.data ?? {}),
          },
        });
      }
    }

    if (messages.length === 0) return;
    await this.push.send(messages);
    this.logger.log(
      `Pushed ${rows.length} notification(s) to ${messages.length} device(s)`,
    );
  }
}
