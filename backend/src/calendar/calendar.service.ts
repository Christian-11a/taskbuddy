import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreateBookingDto,
  ListBookingsQueryDto,
  UpdateBookingDto,
} from './dto/calendar.dto';
import type { Profile } from '../common/types';

// Embed the job + the counterpart names so the calendar can render a card.
const BOOKING_SELECT =
  '*, jobs(title, status, category_id, service_categories(name)), client:profiles!bookings_client_id_fkey(full_name), provider:profiles!bookings_provider_id_fkey(full_name)';

const INACTIVE_JOB_STATUSES = new Set(['cancelled', 'expired']);

@Injectable()
export class CalendarService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Bookings for the caller (as provider or client), optionally within a date range. */
  async list(user: Profile, query: ListBookingsQueryDto) {
    const column = user.role === 'provider' ? 'provider_id' : 'client_id';
    let builder = this.supabase.admin
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq(column, user.id)
      .order('scheduled_at', { ascending: true });
    if (query.from) builder = builder.gte('scheduled_at', query.from);
    if (query.to) builder = builder.lte('scheduled_at', query.to);
    const { data, error } = await builder;
    if (error) throw new BadRequestException(error.message);
    // A booking row outlives its job being cancelled or expiring; neither
    // belongs on anyone's calendar.
    return (data ?? []).filter(
      (b: { jobs?: { status?: string } | null }) =>
        !INACTIVE_JOB_STATUSES.has(b.jobs?.status ?? ''),
    );
  }

  /** Provider schedules one of their assigned jobs. */
  async create(user: Profile, dto: CreateBookingDto) {
    const { data: job, error: jobError } = await this.supabase.admin
      .from('jobs')
      .select('id, client_id, assigned_provider_id, status')
      .eq('id', dto.job_id)
      .maybeSingle();
    if (jobError) throw new BadRequestException(jobError.message);
    if (!job) throw new NotFoundException('Job not found');
    if (job.assigned_provider_id !== user.id) {
      throw new ForbiddenException('You are not assigned to this job');
    }

    const { data, error } = await this.supabase.admin
      .from('bookings')
      .insert({
        job_id: dto.job_id,
        provider_id: user.id,
        client_id: job.client_id,
        scheduled_at: dto.scheduled_at,
        duration_minutes: dto.duration_minutes ?? 120,
        notes: dto.notes ?? null,
      })
      .select(BOOKING_SELECT)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async update(user: Profile, bookingId: string, dto: UpdateBookingDto) {
    const { data: booking, error: findError } = await this.supabase.admin
      .from('bookings')
      .select('id, provider_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.provider_id !== user.id) {
      throw new ForbiddenException('You can only edit your own bookings');
    }

    const patch: Record<string, unknown> = {};
    if (dto.scheduled_at !== undefined) patch.scheduled_at = dto.scheduled_at;
    if (dto.duration_minutes !== undefined)
      patch.duration_minutes = dto.duration_minutes;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const { data, error } = await this.supabase.admin
      .from('bookings')
      .update(patch)
      .eq('id', bookingId)
      .select(BOOKING_SELECT)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
