import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EscrowService } from '../escrow/escrow.service';
import { ApplyDto } from './dto/applications.dto';
import type { Profile } from '../common/types';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

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

  /**
   * Accept: the DB trigger assigns the job and auto-rejects sibling
   * applications.
   *
   * **Escrow is held before the application is accepted, not after.** The
   * accept is an `update` that fires `handle_application_accepted`, which
   * assigns the job, rejects every rival applicant and opens a booking — a
   * cascade nothing in application code can cleanly reverse. Holding first
   * means the one failure that actually happens in practice, a client whose
   * wallet cannot cover the budget, is refused while the job is still open and
   * every applicant is still in the running. The old order accepted first and
   * discovered the shortfall afterwards, leaving a provider hired against
   * money that was never held.
   *
   * If the accept itself then fails, the hold is rolled back and the client
   * credited. That direction of failure is recoverable; the other is not.
   *
   * **Only a hold this call actually placed is rolled back.** `escrow.hold()`
   * is idempotent, so the losing half of a double-tap gets the winner's hold
   * handed back to it, then fails its own `setStatus` because the application
   * is no longer pending. Undoing the hold there would refund the client for a
   * hire that had in fact succeeded, leaving an assigned job with no money
   * behind it — worse than the bug this ordering exists to fix. `placed` is
   * what distinguishes the two.
   */
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

    // No-ops for jobs posted without a budget (everything before migration
    // 0007); throws, before anything is accepted, when the wallet is short.
    const { placed } = await this.escrow.hold(
      application.job_id,
      application.provider_id,
    );

    let updated: unknown;
    try {
      updated = await this.setStatus(applicationId, 'accepted');
    } catch (err) {
      if (placed) await this.rollbackHold(application.job_id, err);
      throw err;
    }

    await this.notifyProvider(
      application,
      'Application accepted',
      `You were hired for "${application.jobs.title}"!`,
    );
    return updated;
  }

  /**
   * The hire failed after its money was held. Give it back.
   *
   * A failure here is swallowed rather than replacing the original error: the
   * client needs to be told why the hire did not happen, and "the rollback
   * also failed" is an operator's problem, not theirs. It is logged loudly
   * because it leaves a hold with no hire behind it — the one state this
   * ordering can produce that a human has to unpick.
   */
  private async rollbackHold(jobId: string, cause: unknown) {
    try {
      await this.escrow.releaseHoldForFailedHire(jobId);
    } catch (rollbackErr) {
      this.logger.error(
        `Job ${jobId}: accept failed (${(cause as Error).message}) and the ` +
          `escrow hold could not be released (${(rollbackErr as Error).message}) ` +
          `— the client is debited for a hire that did not happen`,
      );
    }
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

  /**
   * `status = 'pending'` is re-asserted in the WHERE clause, not just checked
   * in memory beforehand. Two taps arriving together both read `pending`; this
   * is what makes exactly one of them fire `handle_application_accepted`,
   * rather than both assigning the job and rejecting each other's siblings.
   */
  private async setStatus(applicationId: string, status: string) {
    const { data, error } = await this.supabase.admin
      .from('job_applications')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', applicationId)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new BadRequestException(
        'This application was already decided by someone else',
      );
    }
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
