import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ListActivityQueryDto,
  ListBookingsQueryDto,
  ListUsersQueryDto,
  SuspendUserDto,
  UpdateMaintenanceDto,
} from './dto/admin.dto';
import { AdminActionsService } from './admin-actions.service';
import type { Profile } from '../common/types';
import { JOB_PHOTOS_BUCKET } from '../uploads/uploads.constants';

// admin_user_overview (migration 0005) joins profiles with auth.users email;
// readable by the service role only.
const USER_VIEW = 'admin_user_overview';

const BOOKING_SELECT =
  '*, service_categories(name), ' +
  'client:profiles!jobs_client_id_fkey(id, full_name), ' +
  'provider:profiles!jobs_assigned_provider_id_fkey(id, full_name)';

@Injectable()
export class AdminService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly adminActions: AdminActionsService,
  ) {}

  async listUsers(query: ListUsersQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    let builder = this.supabase.admin
      .from(USER_VIEW)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.search) {
      const term = `%${query.search}%`;
      builder = builder.or(`full_name.ilike.${term},email.ilike.${term}`);
    }
    if (query.role) builder = builder.eq('role', query.role);
    if (query.status === 'deleted') {
      builder = builder.not('deleted_at', 'is', null);
    } else if (query.status === 'suspended') {
      // Deleted accounts also carry deactivated_at (that is what makes every
      // existing suspension check refuse them), so they would otherwise show
      // up in the suspension queue as people to consider reinstating.
      builder = builder
        .not('deactivated_at', 'is', null)
        .is('deleted_at', null);
    } else if (query.status === 'active') {
      builder = builder.is('deactivated_at', null).is('deleted_at', null);
    } else {
      builder = builder.is('deleted_at', null);
    }
    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);
    return { users: data ?? [], total: count ?? 0 };
  }

  async getUser(userId: string) {
    const { data, error } = await this.supabase.admin
      .from(USER_VIEW)
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('User not found');
    return data;
  }

  async suspend(admin: Profile, userId: string, dto: SuspendUserDto) {
    const user = await this.findProfile(userId);
    if (user.role === 'admin') {
      throw new ForbiddenException('Admin accounts cannot be suspended');
    }
    if (user.deactivated_at) {
      throw new BadRequestException('Account is already suspended');
    }
    const suspendedUntil = dto.duration_days
      ? new Date(
          Date.now() + dto.duration_days * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;
    const updated = await this.setDeactivated(userId, {
      deactivated_at: new Date().toISOString(),
      suspended_until: suspendedUntil,
      suspension_reason: dto.reason,
    });
    await this.adminActions.record(admin, 'user.suspend', 'profiles', userId, {
      duration_days: dto.duration_days ?? null,
      reason: dto.reason,
    });
    return updated;
  }

  async reinstate(admin: Profile, userId: string) {
    const user = await this.findProfile(userId);
    if (!user.deactivated_at) {
      throw new BadRequestException('Account is not suspended');
    }
    const updated = await this.setDeactivated(userId, {
      deactivated_at: null,
      suspended_until: null,
      suspension_reason: null,
    });
    await this.adminActions.record(admin, 'user.reinstate', 'profiles', userId);
    return updated;
  }

  /** Platform-wide bookings list, filterable by status/category (story #31). */
  async listBookings(query: ListBookingsQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const { data, error } = await this.supabase.admin.rpc(
      'admin_list_bookings',
      {
        p_search_term: query.search ?? null,
        p_status: query.status ?? null,
        p_category_id: query.category_id ?? null,
        p_limit: limit,
        p_offset: offset,
      },
    );
    if (error) throw new BadRequestException(error.message);
    const result = data?.[0];
    return {
      bookings: result?.rows ?? [],
      total: Number(result?.total ?? 0),
    };
  }

  /**
   * Admin-initiated password reset — a thin wrapper over the same primitive
   * POST /auth/forgot-password uses (Supabase's resetPasswordForEmail), just
   * triggered by an admin instead of the account holder. Unlike that public
   * endpoint, this one may surface real errors: the caller already resolved
   * the target by id, so there is no membership-enumeration concern.
   */
  async sendPasswordReset(userId: string) {
    const user = await this.getUser(userId);
    if (user.role === 'admin') {
      throw new ForbiddenException(
        'Cannot trigger a password reset for an admin account',
      );
    }
    if (!user.email) {
      throw new BadRequestException('This account has no email on file');
    }
    const { error } = await this.supabase.anon.auth.resetPasswordForEmail(
      user.email as string,
    );
    if (error) throw new BadRequestException(error.message);
    return { sent: true };
  }

  /** One booking's full detail — the list endpoint's row already carries
   *  description/address/scheduled_at/photo_urls via `select('*')`, so this
   *  differs from a list row only by being fetchable one at a time. */
  async getBooking(jobId: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.supabase.admin
      .from('jobs')
      .select(BOOKING_SELECT)
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Booking not found');
    // BOOKING_SELECT is a concatenated (non-literal) string — supabase-js
    // can't infer a row type from it (same pitfall as JOB_SELECT in
    // jobs.service.ts), so the cast is explicit rather than accidental.
    const booking = data as unknown as Record<string, unknown>;
    if (!('photo_urls' in booking)) return booking;
    const photoUrls = booking.photo_urls;
    return {
      ...booking,
      photo_urls:
        Array.isArray(photoUrls) &&
        photoUrls.every((url) => typeof url === 'string' && url.length > 0)
          ? photoUrls.map((url) =>
              isAbsoluteUrl(url)
                ? url
                : this.supabase.admin.storage
                    .from(JOB_PHOTOS_BUCKET)
                    .getPublicUrl(url).data.publicUrl,
            )
          : [],
    };
  }

  /** Cancels a booking (story #31 extension) — refuses if it's already in a
   *  terminal state. Relies on the existing `log_job_status_change` trigger
   *  for the `job_status_history` audit row; no migration needed. */
  async cancelBooking(admin: Profile, jobId: string) {
    const { data: job, error } = await this.supabase.admin
      .from('jobs')
      .select('id, status')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!job) throw new NotFoundException('Booking not found');
    if (['completed', 'cancelled', 'expired'].includes(job.status)) {
      throw new BadRequestException(`Booking is already ${job.status}`);
    }
    const { data, error: updateError } = await this.supabase.admin
      .from('jobs')
      .update({ status: 'cancelled' })
      .eq('id', jobId)
      .select('*')
      .single();
    if (updateError) throw new BadRequestException(updateError.message);
    await this.adminActions.record(admin, 'booking.cancel', 'jobs', jobId, {
      previous_status: job.status,
    });
    return data;
  }

  /**
   * Aggregates for the Reports page (story #32): booking trends, category
   * breakdown, provider performance. Computed in-process — fine at current
   * platform scale; move into SQL functions if jobs outgrow a single fetch.
   */
  async analyticsSummary() {
    const [
      { data: jobs, error: jobsError },
      { data: users, error: usersError },
    ] = await Promise.all([
      this.supabase.admin
        .from('jobs')
        .select('id, status, posted_at, category_id, service_categories(name)'),
      this.supabase.admin
        .from('profiles')
        .select('id, role, created_at, deactivated_at'),
    ]);
    if (jobsError) throw new BadRequestException(jobsError.message);
    if (usersError) throw new BadRequestException(usersError.message);

    const { data: providers, error: providersError } = await this.supabase.admin
      .from('provider_profiles')
      .select(
        'profile_id, cached_avg_rating, cached_ratings_count, ' +
          'cached_completed_jobs, profiles(full_name), service_categories(name)',
      )
      .order('cached_completed_jobs', { ascending: false })
      .limit(10);
    if (providersError) throw new BadRequestException(providersError.message);

    // Platform-wide average rating (story #32) — every rated provider counts
    // equally; unrated providers (no cached_avg_rating yet) are excluded
    // rather than dragging the average toward zero.
    const { data: ratedProviders, error: ratingsError } =
      await this.supabase.admin
        .from('provider_profiles')
        .select('cached_avg_rating')
        .not('cached_avg_rating', 'is', null);
    if (ratingsError) throw new BadRequestException(ratingsError.message);
    const ratings = (ratedProviders ?? [])
      .map((p) => p.cached_avg_rating as number)
      .filter((r) => r != null);
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : null;

    // Platform revenue (story #32) — completed provider payouts, and nothing
    // else. Filtering on `kind` rather than direction+job_id matters since
    // migration 0009: escrow refunds are *also* credits carrying a job_id, and
    // counting them would inflate revenue by the value of every cancelled or
    // disputed job. Top-ups and withdrawals are excluded for the same reason.
    const { data: revenueTxns, error: revenueError } = await this.supabase.admin
      .from('wallet_transactions')
      .select('amount, created_at')
      .eq('kind', 'payout')
      .eq('status', 'completed');
    if (revenueError) throw new BadRequestException(revenueError.message);

    const revenueByMonth: Record<string, number> = {};
    let totalRevenue = 0;
    for (const txn of revenueTxns ?? []) {
      const amount = Number(txn.amount);
      totalRevenue += amount;
      const month = (txn.created_at ?? '').slice(0, 7); // "YYYY-MM"
      if (month) revenueByMonth[month] = (revenueByMonth[month] ?? 0) + amount;
    }
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyRevenue = revenueByMonth[currentMonth] ?? 0;

    // Commission is what the platform actually keeps (migration 0023), as
    // opposed to `total_revenue` above, which is the value that flowed through
    // it. Both are reported: they answer different questions, and collapsing
    // them into one number called "revenue" is how a marketplace ends up
    // quoting its GMV as its income. Zero everywhere until a rate is set.
    //
    // Read off escrow rather than the ledger on purpose — the commission is
    // withheld, so it has no wallet_transactions row of its own (there is no
    // platform profile for it to belong to). See EscrowService.creditProvider.
    const { data: commissionRows, error: commissionError } =
      await this.supabase.admin
        .from('escrow_transactions')
        .select('commission_amount, released_at')
        .eq('status', 'released')
        .gt('commission_amount', 0);
    if (commissionError) {
      throw new BadRequestException(commissionError.message);
    }

    const commissionByMonth: Record<string, number> = {};
    let totalCommission = 0;
    for (const row of commissionRows ?? []) {
      const amount = Number(row.commission_amount);
      totalCommission += amount;
      const month = (row.released_at ?? '').slice(0, 7);
      if (month) {
        commissionByMonth[month] = (commissionByMonth[month] ?? 0) + amount;
      }
    }
    const monthlyCommission = commissionByMonth[currentMonth] ?? 0;

    const jobsByStatus: Record<string, number> = {};
    const jobsByCategory: Record<string, number> = {};
    const trendByDay: Record<string, number> = {};
    for (const job of jobs ?? []) {
      jobsByStatus[job.status] = (jobsByStatus[job.status] ?? 0) + 1;
      const category =
        (job.service_categories as unknown as { name: string } | null)?.name ??
        'Unknown';
      jobsByCategory[category] = (jobsByCategory[category] ?? 0) + 1;
      const day = (job.posted_at ?? '').slice(0, 10);
      if (day) trendByDay[day] = (trendByDay[day] ?? 0) + 1;
    }

    // Drives the dashboard stat card and the sidebar badge (migration 0008).
    const { count: pendingVerifications } = await this.supabase.admin
      .from('provider_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    // The other queue that needs a human (migration 0023). Unlike
    // verifications, nobody gets paid until someone works this one.
    const { count: pendingWithdrawals } = await this.supabase.admin
      .from('wallet_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'withdrawal')
      .eq('status', 'pending');

    const allUsers = users ?? [];
    return {
      totals: {
        users: allUsers.length,
        clients: allUsers.filter((u) => u.role === 'client').length,
        providers: allUsers.filter((u) => u.role === 'provider').length,
        suspended: allUsers.filter((u) => u.deactivated_at).length,
        bookings: (jobs ?? []).length,
        avg_rating: avgRating,
        total_revenue: round2(totalRevenue),
        monthly_revenue: round2(monthlyRevenue),
        total_commission: round2(totalCommission),
        monthly_commission: round2(monthlyCommission),
        pending_verifications: pendingVerifications ?? 0,
        pending_withdrawals: pendingWithdrawals ?? 0,
      },
      bookings_by_status: jobsByStatus,
      bookings_by_category: jobsByCategory,
      booking_trend: Object.entries(trendByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      revenue_trend: Object.entries(revenueByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount: round2(amount) })),
      commission_trend: Object.entries(commissionByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount: round2(amount) })),
      top_providers: providers ?? [],
    };
  }

  /**
   * Recent platform events for the dashboard's activity feed (story #32) and
   * the Activity Log page — sourced from job_status_history, the existing
   * audit trail of job lifecycle transitions (no new table needed).
   *
   * `{ items, total }` is a breaking shape change from the bare array this
   * returned before pagination existed (BACKEND_SCHEMA.md §23.4) — worth
   * doing now while the web admin console is the only consumer.
   */
  async recentActivity(query: ListActivityQueryDto = {}) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const { data, error } = await this.supabase.admin.rpc(
      'admin_list_activity',
      {
        p_search_term: query.search ?? null,
        p_from: query.from ?? null,
        p_to: query.to ?? null,
        p_limit: limit,
        p_offset: offset,
      },
    );
    if (error) throw new BadRequestException(error.message);
    const result = data?.[0];
    return {
      items: result?.rows ?? [],
      total: Number(result?.total ?? 0),
    };
  }

  /**
   * The single `platform_settings` row (migration 0017) — created by the
   * migration's seed insert, so this should never miss, but `.single()`
   * still surfaces a clear error rather than a silent undefined if it does.
   */
  async getMaintenance() {
    const { data, error } = await this.supabase.admin
      .from('platform_settings')
      .select('maintenance_mode, maintenance_message, updated_at')
      .eq('id', true)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Flips the shared maintenance switch `MaintenanceMiddleware` checks on
   * every request. Logged to admin_actions (§23.5) since this affects every
   * user on the platform at once — the audit trail should show who did it.
   */
  async setMaintenance(admin: Profile, dto: UpdateMaintenanceDto) {
    const { data, error } = await this.supabase.admin
      .from('platform_settings')
      .update({
        maintenance_mode: dto.maintenance_mode,
        maintenance_message: dto.maintenance_message ?? null,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      })
      .eq('id', true)
      .select('maintenance_mode, maintenance_message, updated_at')
      .single();
    if (error) throw new BadRequestException(error.message);
    await this.adminActions.record(
      admin,
      'platform.maintenance_toggle',
      'platform_settings',
      admin.id,
      { maintenance_mode: dto.maintenance_mode },
    );
    return data;
  }

  private async findProfile(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select('id, role, deactivated_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('User not found');
    return data;
  }

  private async setDeactivated(
    userId: string,
    patch: {
      deactivated_at: string | null;
      suspended_until: string | null;
      suspension_reason: string | null;
    },
  ) {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
