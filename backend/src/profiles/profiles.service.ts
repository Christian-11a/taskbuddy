import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { WalletService } from '../wallet/wallet.service';
import { AVATARS_BUCKET } from '../uploads/uploads.constants';
import {
  SetAvailabilityDto,
  UpdateProfileDto,
  UpsertProviderProfileDto,
} from './dto/profiles.dto';
import { ACTIVE_JOB_STATUSES, DeletionBlocker } from './dto/account-deletion';
import type { Profile } from '../common/types';

/**
 * Supabase expresses "banned indefinitely" as a duration. A hundred years is
 * the idiomatic stand-in for it; there is no `ban_duration: 'forever'`.
 */
const INDEFINITE_BAN = '876000h';

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
    private readonly wallet: WalletService,
  ) {}

  async updateProfile(user: Profile, dto: UpdateProfileDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.avatar_url !== undefined) {
      patch.avatar_url = this.resolveAvatar(user, dto.avatar_url);
    }

    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update(patch)
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * `avatar_url` accepts either of the two things that legitimately end up in
   * that column, and normalises both to something an <Image> can render:
   *
   *   - a Storage object path from POST /uploads/signed-url, which is what the
   *     app's "Change Photo" flow produces. Converted to a public URL here so
   *     every consumer — job cards, chat headers, the admin console — can use
   *     the column directly instead of each learning the bucket layout.
   *   - an absolute https URL, which is what Google hands us at sign-in.
   *
   * Ownership is checked before conversion. Without it, passing another user's
   * path would silently adopt their photo, and passing an arbitrary http URL
   * would let a profile beacon every viewer to a third-party server.
   */
  private resolveAvatar(user: Profile, value: string): string | null {
    if (value === '') return null;

    if (/^https?:\/\//i.test(value)) {
      if (!value.toLowerCase().startsWith('https://')) {
        throw new BadRequestException('avatar_url must be an https URL');
      }
      return value;
    }

    this.uploads.assertOwnedPaths(user, [value]);
    return this.uploads.publicUrl(AVATARS_BUCKET, value);
  }

  async upsertProviderProfile(user: Profile, dto: UpsertProviderProfileDto) {
    const { data: category } = await this.supabase.admin
      .from('service_categories')
      .select('id')
      .eq('id', dto.category_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!category)
      throw new BadRequestException('Unknown or inactive category_id');

    // cached_* columns are intentionally never written here — triggers own them.
    const { data, error } = await this.supabase.admin
      .from('provider_profiles')
      .upsert(
        {
          profile_id: user.id,
          category_id: dto.category_id,
          bio: dto.bio,
          years_experience: dto.years_experience ?? 0,
          service_radius_km: dto.service_radius_km ?? 15.0,
        },
        { onConflict: 'profile_id' },
      )
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Self-serve account deletion - item 1 of
   * docs/backend-handoff-mobile-todo-gaps.md.
   *
   * Two decisions are baked in here, both of which that document asked for.
   *
   * **It refuses rather than unwinds.** An account with money or obligations
   * in flight answers 409 listing exactly what is in the way, and the user
   * resolves those first. The alternative - deleting anyway and cleaning up
   * behind them - means the API deciding on its own to cancel someone else's
   * confirmed booking or to write off a balance, which is not a call it gets
   * to make silently.
   *
   * **It is a soft delete.** `wallet_transactions`, `reviews`, `jobs` and
   * `recommendation_candidates` all cascade off `profiles`, and every one of
   * them has to outlive the account: the ledger is the record of money, the
   * reviews and job history belong to the *other* party, and the candidate
   * snapshots are the ML retraining set (BACKEND_SCHEMA.md 13). So the row
   * stays and everything identifying on it is overwritten - which is what
   * actually discharges the erasure, rather than the row's absence.
   *
   * Three things happen to the Supabase Auth user, and all three matter: the
   * email is rotated to a dead address so the real one can be used to register
   * again, the user is banned so no new session can be minted, and the current
   * session is signed out so the token in the app's hand stops working now
   * rather than at its next expiry.
   */
  async deleteAccount(user: Profile, accessToken: string) {
    const blockers = await this.deletionBlockers(user);
    if (blockers.length > 0) {
      // 409, not 400: nothing about the request is malformed. The account is
      // simply not in a state that can be deleted yet.
      throw new ConflictException({
        message: 'This account still has obligations in flight',
        blockers,
      });
    }

    const now = new Date().toISOString();
    const { error } = await this.supabase.admin
      .from('profiles')
      .update({
        deleted_at: now,
        // Every existing suspension check - JwtAuthGuard, login, password
        // reset, the Google callback - already refuses on this column. Setting
        // it means none of them need to learn about deleted_at.
        deactivated_at: now,
        full_name: 'Deleted user',
        phone: null,
        avatar_url: null,
        address: null,
        city: null,
        latitude: null,
        longitude: null,
      })
      .eq('id', user.id);
    if (error) throw new BadRequestException(error.message);

    // A provider disappears from the marketplace as well as from sign-in.
    // Availability is what browse and the recommender filter on, so an
    // unavailable provider is never offered a job even if some query elsewhere
    // forgets to check deleted_at.
    if (user.role === 'provider') {
      await this.supabase.admin
        .from('provider_profiles')
        .update({ is_available: false })
        .eq('profile_id', user.id);
    }

    await this.retireAuthUser(user.id, accessToken);
    return { deleted: true };
  }

  /**
   * The 409's contents. Each check is one the handoff document names, and they
   * all run rather than short-circuiting on the first: a user who has to come
   * back three times because the API mentioned one blocker at a time has been
   * told the truth and still been treated badly.
   */
  private async deletionBlockers(user: Profile): Promise<DeletionBlocker[]> {
    const [balance, pendingWithdrawals, escrows, activeJobs] =
      await Promise.all([
        this.wallet.balanceFor(user.id),
        this.countRows(
          this.supabase.admin
            .from('wallet_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('profile_id', user.id)
            .eq('kind', 'withdrawal')
            .eq('status', 'pending'),
        ),
        this.supabase.admin
          .from('escrow_transactions')
          .select('status')
          .or(`client_id.eq.${user.id},provider_id.eq.${user.id}`)
          .in('status', ['held', 'disputed']),
        this.countRows(
          this.supabase.admin
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .or(`client_id.eq.${user.id},assigned_provider_id.eq.${user.id}`)
            .in('status', [...ACTIVE_JOB_STATUSES]),
        ),
      ]);

    const escrowRows = (escrows.data ?? []) as { status: string }[];
    const held = escrowRows.filter((e) => e.status === 'held').length;
    const disputed = escrowRows.filter((e) => e.status === 'disputed').length;

    const blockers: DeletionBlocker[] = [];
    if (balance > 0) {
      blockers.push({
        code: 'wallet_balance',
        message: `Your wallet still holds PHP ${balance.toFixed(2)}. Withdraw it before deleting your account.`,
      });
    }
    if (pendingWithdrawals > 0) {
      blockers.push({
        code: 'pending_withdrawal',
        message: `You have ${pendingWithdrawals} withdrawal request${pendingWithdrawals === 1 ? '' : 's'} still being processed.`,
      });
    }
    if (held > 0) {
      blockers.push({
        code: 'escrow_held',
        message: `${held} job${held === 1 ? ' has' : 's have'} money held in escrow. Complete or cancel ${held === 1 ? 'it' : 'them'} first.`,
      });
    }
    if (disputed > 0) {
      blockers.push({
        code: 'open_dispute',
        message: `${disputed} dispute${disputed === 1 ? '' : 's'} on your jobs ${disputed === 1 ? 'is' : 'are'} still open.`,
      });
    }
    if (activeJobs > 0) {
      blockers.push({
        code: 'active_job',
        message: `${activeJobs} job${activeJobs === 1 ? ' is' : 's are'} still in progress.`,
      });
    }
    return blockers;
  }

  private async countRows(builder: PromiseLike<{ count: number | null }>) {
    const { count } = await builder;
    return count ?? 0;
  }

  /**
   * Retires the Auth user behind a deleted profile.
   *
   * Deliberately not `auth.admin.deleteUser`: `admin_user_overview` (migration
   * 0005) inner-joins `auth.users`, so deleting the Auth row would drop the
   * account out of the admin console entirely - including out of any
   * after-the-fact question about what it did before it left.
   *
   * Failures are logged, not thrown. The profile is already marked deleted and
   * the guard already refuses the account; answering 500 to a user who asked
   * to leave, over a step that only tidies up Auth, would be the worse answer.
   */
  private async retireAuthUser(userId: string, accessToken: string) {
    const { error } = await this.supabase.admin.auth.admin.updateUserById(
      userId,
      {
        // Frees the real address for re-registration. `.invalid` is reserved
        // by RFC 2606 precisely so it can never be a deliverable mailbox.
        email: `deleted-${userId}@deleted.invalid`,
        ban_duration: INDEFINITE_BAN,
      },
    );
    if (error) {
      this.logger.error(
        `Profile ${userId} was deleted but its auth user could not be retired: ${error.message}`,
      );
    }
    // Kills the token the caller is holding right now, rather than leaving it
    // valid until it expires on its own.
    await this.supabase.admin.auth.admin.signOut(accessToken);
  }

  async setAvailability(user: Profile, dto: SetAvailabilityDto) {
    const { data, error } = await this.supabase.admin
      .from('provider_profiles')
      .update({ is_available: dto.is_available })
      .eq('profile_id', user.id)
      .select()
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Provider profile not set up yet');
    return data;
  }
}
