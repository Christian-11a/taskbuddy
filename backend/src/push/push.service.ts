import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDeviceDto } from './dto/push.dto';
import type { Profile } from '../common/types';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo's documented cap for one /push/send call. */
const EXPO_BATCH_SIZE = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** The subset of Expo's per-message result this code acts on. */
interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Device registration and delivery through Expo's push service (migration 0012).
 *
 * Expo rather than FCM/APNs directly: the app is distributed through Expo Go
 * and EAS builds, so the tokens the device can produce are Expo tokens, and
 * going direct would mean provisioning an APNs key and a FCM server key for a
 * project that has neither.
 *
 * Delivery is best-effort by design. `notifications` remains the source of
 * truth and the app still lists from it — a push that never arrives costs the
 * user a banner, never a record.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Registers (or re-registers) the calling account's device.
   *
   * Upserting on `token` rather than inserting is what handles a device
   * changing hands: signing in as someone else on a handset re-registers the
   * same Expo token, and the row must move to the new owner instead of leaving
   * the previous account receiving that phone's notifications.
   */
  async registerDevice(user: Profile, dto: RegisterDeviceDto) {
    const { data, error } = await this.supabase.admin
      .from('device_tokens')
      .upsert(
        {
          profile_id: user.id,
          token: dto.token,
          platform: dto.platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      )
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Drops a device, on sign-out.
   *
   * Scoped to the caller's own rows: without the profile_id predicate this
   * would let any authenticated user silence any other user's phone by
   * guessing — or replaying — a token string.
   */
  async unregisterDevice(user: Profile, token: string) {
    const { error } = await this.supabase.admin
      .from('device_tokens')
      .delete()
      .eq('token', token)
      .eq('profile_id', user.id);
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  async tokensFor(profileIds: string[]): Promise<Map<string, string[]>> {
    const unique = [...new Set(profileIds)];
    if (unique.length === 0) return new Map();

    const { data, error } = await this.supabase.admin
      .from('device_tokens')
      .select('profile_id, token')
      .in('profile_id', unique);
    if (error) throw new BadRequestException(error.message);

    const byProfile = new Map<string, string[]>();
    for (const row of (data ?? []) as {
      profile_id: string;
      token: string;
    }[]) {
      const list = byProfile.get(row.profile_id) ?? [];
      list.push(row.token);
      byProfile.set(row.profile_id, list);
    }
    return byProfile;
  }

  /**
   * Sends messages in Expo-sized batches and prunes tokens Expo rejects as
   * permanently dead.
   *
   * Never throws: the only caller is a scheduler tick with no user waiting on
   * it, and a push outage must not stop the tick from claiming the next batch.
   */
  async send(messages: PushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          this.logger.warn(
            `Expo push rejected a batch of ${batch.length}: HTTP ${res.status}`,
          );
          continue;
        }
        const body = (await res.json()) as { data?: ExpoTicket[] };
        await this.pruneDeadTokens(batch, body.data ?? []);
      } catch (err) {
        this.logger.warn(`Expo push batch failed: ${(err as Error).message}`);
      }
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    // Only needed once push security is enabled on the Expo project; sending
    // without it works for a project that has not turned that on.
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }

  /**
   * `DeviceNotRegistered` means the app was uninstalled or the token was
   * rotated — it will never be deliverable again. Left in place, these
   * accumulate and every future send wastes a slot in the batch on them.
   *
   * Tickets come back positionally aligned with the batch that produced them.
   */
  private async pruneDeadTokens(batch: PushMessage[], tickets: ExpoTicket[]) {
    const dead = batch
      .filter(
        (_, idx) => tickets[idx]?.details?.error === 'DeviceNotRegistered',
      )
      .map((m) => m.to);
    if (dead.length === 0) return;

    await this.supabase.admin.from('device_tokens').delete().in('token', dead);
    this.logger.log(`Pruned ${dead.length} unregistered device token(s)`);
  }
}
