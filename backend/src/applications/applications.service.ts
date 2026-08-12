import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EscrowService } from '../escrow/escrow.service';
import { ApplyDto } from './dto/applications.dto';
import type { Profile } from '../common/types';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly escrow: EscrowService,
  ) {}

  async apply(user: Profile, jobId: string, dto: ApplyDto) {
    const { data: job } = await this.supabase.admin
      .from('jobs')
      .select('id, title, status, client_id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new NotFoundException('Job not found');
    if (!['open', 'recommending'].includes(job.status)) {
      throw new BadRequestException(
        `Job is no longer accepting applications (${job.status})`,
      );
    }

    const { data: providerProfile } = await this.supabase.admin
      .from('provider_profiles')
      .select('profile_id, is_verified')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!providerProfile) {
      throw new BadRequestException(
        'Set up your provider profile before applying',
      );
    }
    if (!providerProfile.is_verified) {
      throw new ForbiddenException(
        'Verify your identity before applying to jobs',
      );
    }

    // Was this provider recommended for this job? Then the application is
    // 'recommended' and must be linked back to the candidate row (schema §9.3).
    const { data: candidate } = await this.supabase.admin
      .from('recommendation_candidates')
      .select('id, recommendation_runs!inner(job_id)')
      .eq('provider_id', user.id)
      .eq('recommendation_runs.job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: application, error } = await this.supabase.admin
      .from('job_applications')
      .insert({
        job_id: jobId,
        provider_id: user.id,
        cover_message: dto.cover_message ?? null,
        source: candidate ? 'recommended' : 'organic',
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('You already applied to this job');
      }
      throw new BadRequestException(error.message);
    }

    if (candidate) {
      // Fires the trigger that recomputes the provider's cached response time.
      await this.supabase.admin
        .from('recommendation_candidates')
        .update({ application_id: application.id })
        .eq('id', candidate.id);
    }

    await this.supabase.admin.from('notifications').insert({
      recipient_id: job.client_id,
      type: 'application_update',
      title: 'New application',
      body: `${user.full_name} applied to "${job.title}".`,
      data: { job_id: jobId, application_id: application.id },
    });

    return application;
  }

  async listForJob(user: Profile, jobId: string) {
    const { data: job } = await this.supabase.admin
      .from('jobs')
      .select('id, client_id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new NotFoundException('Job not found');
    if (job.client_id !== user.id) throw new ForbiddenException('Not your job');

    const { data } = await this.supabase.admin
      .from('job_applications')
      .select(
        '*, provider:profiles!job_applications_provider_id_fkey(id, full_name, avatar_url, city)',
      )
      .eq('job_id', jobId)
      .order('applied_at', { ascending: true });
    return data ?? [];
  }

  async mine(user: Profile) {
    const { data } = await this.supabase.admin
      .from('job_applications')
      .select(
        '*, jobs(id, title, status, urgency, address, service_categories(name))',
      )
      .eq('provider_id', user.id)
      .order('applied_at', { ascending: false });
    return data ?? [];
  }

  /** Accept: the DB trigger assigns the job and auto-rejects sibling applications. */
  async accept(user: Profile, applicationId: string) {
    const application = await this.findWithJob(applicationId);
    if (application.jobs.client_id !== user.id)
      throw new ForbiddenException('Not your job');
    if (application.status !== 'pending') {
      throw new BadRequestException(
        `Application is already '${application.status}'`,
      );
    }
    if (!['open', 'recommending'].includes(application.jobs.status)) {
      throw new BadRequestException('Job already has an assigned provider');
    }

    const updated = await this.setStatus(applicationId, 'accepted');
    // Hold the client's budget against the job. No-ops for jobs posted without
    // one (everything created before migration 0007).
    await this.escrow.hold(application.job_id, application.provider_id);
    await this.notifyProvider(
      application,
      'Application accepted',
      `You were hired for "${application.jobs.title}"!`,
    );
    return updated;
  }

  async reject(user: Profile, applicationId: string) {
    const application = await this.findWithJob(applicationId);
    if (application.jobs.client_id !== user.id)
      throw new ForbiddenException('Not your job');
    if (application.status !== 'pending') {
      throw new BadRequestException(
        `Application is already '${application.status}'`,
      );
    }
    const updated = await this.setStatus(applicationId, 'rejected');
    await this.notifyProvider(
      application,
      'Application update',
      `Your application to "${application.jobs.title}" was not selected.`,
    );
    return updated;
  }

  async withdraw(user: Profile, applicationId: string) {
    const application = await this.findWithJob(applicationId);
    if (application.provider_id !== user.id) {
      throw new ForbiddenException('Not your application');
    }
    if (application.status !== 'pending') {
      throw new BadRequestException(
        `Application is already '${application.status}'`,
      );
    }
    return this.setStatus(applicationId, 'withdrawn');
  }

  private async findWithJob(applicationId: string) {
    const { data, error } = await this.supabase.admin
      .from('job_applications')
      .select('*, jobs(id, title, status, client_id)')
      .eq('id', applicationId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Application not found');
    return data;
  }

  private async setStatus(applicationId: string, status: string) {
    const { data, error } = await this.supabase.admin
      .from('job_applications')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  private async notifyProvider(
    application: { provider_id: string; job_id: string; id: string },
    title: string,
    body: string,
  ) {
    await this.supabase.admin.from('notifications').insert({
      recipient_id: application.provider_id,
      type: 'application_update',
      title,
      body,
      data: { job_id: application.job_id, application_id: application.id },
    });
  }
}
