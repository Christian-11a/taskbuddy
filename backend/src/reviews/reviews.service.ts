import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReviewDto } from './dto/reviews.dto';
import type { Profile } from '../common/types';

@Injectable()
export class ReviewsService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(user: Profile, jobId: string, dto: CreateReviewDto) {
    const { data: job } = await this.supabase.admin
      .from('jobs')
      .select('id, title, status, client_id, assigned_provider_id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new NotFoundException('Job not found');
    if (job.client_id !== user.id) throw new ForbiddenException('Not your job');
    if (job.status !== 'completed') {
      throw new BadRequestException('You can only review completed jobs');
    }
    // `reviews.provider_id` is NOT NULL, so without this the request comes
    // back as a raw Postgres constraint message. A completed job should always
    // have had somebody do the work, but a job cancelled and force-completed
    // by an admin need not, and "who exactly is being rated" is not a question
    // to answer with a 500.
    if (!job.assigned_provider_id) {
      throw new BadRequestException(
        'This job has no assigned provider to review',
      );
    }

    // Insert fires the trigger that refreshes the provider's cached rating.
    const { data, error } = await this.supabase.admin
      .from('reviews')
      .insert({
        job_id: jobId,
        client_id: user.id,
        provider_id: job.assigned_provider_id,
        rating: dto.rating,
        comment: dto.comment ?? null,
      })
      .select()
      .single();
    if (error) {
      // reviews.job_id is UNIQUE — one review per job, and the constraint is
      // what enforces it rather than a read-then-write that two taps could
      // both pass. `has_review` on the job payload is the UI's way of not
      // reaching this in the first place.
      if (error.code === '23505') {
        throw new BadRequestException('This job already has a review');
      }
      throw new BadRequestException(error.message);
    }

    // The provider's cached rating just changed and nothing else would tell
    // them. Best-effort: a notification that fails to write must not undo a
    // review that is already recorded.
    await this.supabase.admin.from('notifications').insert({
      recipient_id: job.assigned_provider_id,
      type: 'job_update',
      title: 'You received a review',
      body: `${user.full_name} rated your work on "${job.title}" ${dto.rating} out of 5.`,
      data: { job_id: jobId },
    });

    return data;
  }

  async listForProvider(providerId: string) {
    const { data } = await this.supabase.admin
      .from('reviews')
      .select(
        'id, rating, comment, created_at, client:profiles!reviews_client_id_fkey(full_name, avatar_url), jobs(title)',
      )
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });
    return data ?? [];
  }
}
