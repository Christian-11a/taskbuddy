import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListBookingsQueryDto, ListUsersQueryDto } from './dto/admin.dto';

// admin_user_overview (migration 0005) joins profiles with auth.users email;
// readable by the service role only.
const USER_VIEW = 'admin_user_overview';

const BOOKING_SELECT =
  '*, service_categories(name), ' +
  'client:profiles!jobs_client_id_fkey(id, full_name), ' +
  'provider:profiles!jobs_assigned_provider_id_fkey(id, full_name)';

const ACTIVITY_SELECT =
  'id, old_status, new_status, changed_at, ' +
  'jobs(title), changed_by:profiles(full_name)';

@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseService) {}

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
    if (query.status === 'suspended') {
      builder = builder.not('deactivated_at', 'is', null);
    } else if (query.status === 'active') {
      builder = builder.is('deactivated_at', null);
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

  async suspend(userId: string) {
    const user = await this.findProfile(userId);
    if (user.role === 'admin') {
      throw new ForbiddenException('Admin accounts cannot be suspended');
    }
    if (user.deactivated_at) {
      throw new BadRequestException('Account is already suspended');
    }
    return this.setDeactivated(userId, new Date().toISOString());
  }

  async reinstate(userId: string) {
    const user = await this.findProfile(userId);
    if (!user.deactivated_at) {
      throw new BadRequestException('Account is not suspended');
    }
    return this.setDeactivated(userId, null);
  }

  /** Platform-wide bookings list, filterable by status/category (story #31). */
  async listBookings(query: ListBookingsQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    let builder = this.supabase.admin
      .from('jobs')
      .select(BOOKING_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.status) builder = builder.eq('status', query.status);
    if (query.category_id)
      builder = builder.eq('category_id', query.category_id);
    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);
    return { bookings: data ?? [], total: count ?? 0 };
  }

  /** Cancels a booking (story #31 extension) — refuses if it's already in a
   *  terminal state. Relies on the existing `log_job_status_change` trigger
   *  for the `job_status_history` audit row; no migration needed. */
  async cancelBooking(jobId: string) {
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

    // Platform revenue (story #32) — completed, job-linked wallet credits
    // (job payouts/fees). Top-ups and withdrawals carry no job_id and aren't
    // platform revenue, so they're excluded.
    const { data: revenueTxns, error: revenueError } = await this.supabase.admin
      .from('wallet_transactions')
      .select('amount, created_at')
      .eq('direction', 'credit')
      .eq('status', 'completed')
      .not('job_id', 'is', null);
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
      },
      bookings_by_status: jobsByStatus,
      bookings_by_category: jobsByCategory,
      booking_trend: Object.entries(trendByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      revenue_trend: Object.entries(revenueByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount: round2(amount) })),
      top_providers: providers ?? [],
    };
  }

  /** Recent platform events for the dashboard's activity feed (story #32) —
   *  sourced from job_status_history, the existing audit trail of job
   *  lifecycle transitions (no new table needed). */
  async recentActivity(limit = 20) {
    const { data, error } = await this.supabase.admin
      .from('job_status_history')
      .select(ACTIVITY_SELECT)
      .order('changed_at', { ascending: false })
      .limit(limit);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
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

  private async setDeactivated(userId: string, value: string | null) {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update({ deactivated_at: value })
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
