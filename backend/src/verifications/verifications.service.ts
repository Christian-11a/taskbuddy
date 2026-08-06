import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { StripeService } from '../payments/stripe.service';
import { AdminActionsService } from '../admin/admin-actions.service';
import { VERIFICATION_DOCS_BUCKET } from '../uploads/uploads.constants';
import {
  ListVerificationsQueryDto,
  RejectVerificationDto,
  SubmitVerificationDto,
} from './dto/verifications.dto';
import type { Profile, VerificationMethod } from '../common/types';

/**
 * API version for the Identity ephemeral key. Pinned separately from this
 * server's own calls because it is the mobile SDK, not this server, that
 * consumes the key. Override when @stripe/stripe-react-native requires a newer
 * one.
 */
const IDENTITY_API_VERSION =
  process.env.STRIPE_MOBILE_API_VERSION ?? '2025-01-27';

/**
 * Row shape as stored. Document paths are null on Stripe Identity rows — those
 * documents live in Stripe and are never sent to us (migration 0013).
 */
interface VerificationRow {
  id: string;
  provider_id: string;
  id_document_path: string | null;
  selfie_path: string | null;
  method: VerificationMethod;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  profiles?: { full_name: string } | null;
}

@Injectable()
export class VerificationsService {
  private readonly logger = new Logger(VerificationsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
    private readonly stripe: StripeService,
    private readonly adminActions: AdminActionsService,
  ) {}

  // ── Provider side ─────────────────────────────────────────────────────────

  async submit(user: Profile, dto: SubmitVerificationDto) {
    this.uploads.assertOwnedPaths(user, [
      dto.id_document_path,
      dto.selfie_path,
    ]);
    // Usability guard (§23.7) — catch a missing/empty/non-image upload here
    // rather than making the provider wait for a manual rejection.
    await Promise.all([
      this.uploads.assertValidImage(
        VERIFICATION_DOCS_BUCKET,
        dto.id_document_path,
      ),
      this.uploads.assertValidImage(VERIFICATION_DOCS_BUCKET, dto.selfie_path),
    ]);

    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .insert({
        provider_id: user.id,
        id_document_path: dto.id_document_path,
        selfie_path: dto.selfie_path,
      })
      .select('*')
      .single();

    // uq_provider_verifications_one_pending — a provider may resubmit after a
    // rejection, but only one review can be open at a time.
    if (error?.code === '23505') {
      throw new BadRequestException(
        'You already have a verification under review',
      );
    }
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Starts a Stripe Identity session — the second route to a verified badge,
   * alongside the manual ID + selfie queue above (migration 0013).
   *
   * The documents go to Stripe and never reach us. That is the point: this
   * server stops holding government IDs for providers who take this route, and
   * the decision arrives by webhook rather than waiting on an admin.
   *
   * The row is written up front, pending, so the provider's status screen has
   * something to show between opening the sheet and the webhook landing.
   */
  async startIdentitySession(user: Profile) {
    const stripe = this.stripe.stripe;

    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { profile_id: user.id },
    });

    // The mobile SDK drives the session with this key rather than the URL.
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { verification_session: session.id },
      { apiVersion: IDENTITY_API_VERSION },
    );

    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .insert({
        provider_id: user.id,
        method: 'stripe_identity',
        stripe_session_id: session.id,
      })
      .select('*')
      .single();

    // uq_provider_verifications_one_pending — one open review at a time,
    // whichever route it came in by.
    if (error?.code === '23505') {
      await stripe.identity.verificationSessions.cancel(session.id);
      throw new BadRequestException(
        'You already have a verification under review',
      );
    }
    if (error) throw new BadRequestException(error.message);

    return {
      verification: data,
      session_id: session.id,
      ephemeral_key_secret: ephemeralKey.secret,
      // Browser fallback for clients that cannot present the native sheet.
      url: session.url,
      publishable_key: this.stripe.publishableKey,
    };
  }

  /**
   * Applies a Stripe Identity outcome. Called from the webhook, so it takes a
   * session id rather than a Profile — there is no authenticated caller.
   *
   * Written to be safely repeatable: Stripe retries until it gets a 2xx, and
   * every write here is an assignment to a known value.
   */
  async applyIdentityResult(
    sessionId: string,
    outcome: 'verified' | 'rejected',
    reason?: string,
  ) {
    const { data: row, error } = await this.supabase.admin
      .from('provider_verifications')
      .select('*')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!row) {
      // A session we have no record of — created against another environment
      // sharing this Stripe account, most likely. Nothing to do.
      this.logger.warn(`No verification row for Stripe session ${sessionId}`);
      return;
    }

    const verification = row as VerificationRow;
    if (verification.status !== 'pending') return;

    const approved = outcome === 'verified';
    await this.review(verification.id, {
      status: approved ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      // No admin made this call, and reviewed_by references profiles.
      reviewed_by: null,
      rejection_reason: approved ? null : (reason ?? null),
    });

    if (approved) {
      await this.supabase.admin
        .from('provider_profiles')
        .update({ is_verified: true })
        .eq('profile_id', verification.provider_id);
    }

    await this.notify(
      verification.provider_id,
      approved ? 'Verification approved' : 'Verification failed',
      approved
        ? 'Your ID has been verified. Your profile now shows a verified badge.'
        : (reason ?? 'We could not verify your ID. You can try again.'),
    );
  }

  /** The provider's own latest submission, for the mobile status screen. */
  async mine(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .select('*')
      .eq('provider_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ── Admin side ────────────────────────────────────────────────────────────

  /**
   * The admin queue. Rows are denormalised (provider name + email + document
   * URLs) because the web console renders them directly.
   */
  async list(query: ListVerificationsQueryDto) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    let builder = this.supabase.admin
      .from('provider_verifications')
      .select(
        '*, profiles!provider_verifications_provider_id_fkey(full_name)',
        {
          count: 'exact',
        },
      )
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.status) builder = builder.eq('status', query.status);

    const { data, error, count } = await builder;
    if (error) throw new BadRequestException(error.message);

    const rows = (data ?? []) as VerificationRow[];
    const emails = await this.emailsFor(rows.map((r) => r.provider_id));
    const verifications = await Promise.all(
      rows.map((row) => this.shape(row, emails)),
    );
    return { verifications, total: count ?? 0 };
  }

  async approve(admin: Profile, id: string) {
    const row = await this.findPending(id);

    const updated = await this.review(id, {
      status: 'approved',
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    });

    await this.supabase.admin
      .from('provider_profiles')
      .update({ is_verified: true })
      .eq('profile_id', row.provider_id);

    await this.adminActions.record(
      admin,
      'verification.approve',
      'provider_verifications',
      id,
    );
    await this.notify(
      row.provider_id,
      'Verification approved',
      'Your ID has been verified. Your profile now shows a verified badge.',
    );
    return updated;
  }

  async reject(admin: Profile, id: string, dto: RejectVerificationDto) {
    const row = await this.findPending(id);

    const updated = await this.review(id, {
      status: 'rejected',
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: dto.reason ?? null,
    });

    await this.adminActions.record(
      admin,
      'verification.reject',
      'provider_verifications',
      id,
      { reason: dto.reason ?? null },
    );
    await this.notify(
      row.provider_id,
      'Verification rejected',
      dto.reason
        ? `Your verification was rejected: ${dto.reason}`
        : 'Your verification was rejected. You can submit new documents.',
    );
    return updated;
  }

  /** Count of submissions awaiting review — drives the admin dashboard badge. */
  async pendingCount(): Promise<number> {
    const { count, error } = await this.supabase.admin
      .from('provider_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) throw new BadRequestException(error.message);
    return count ?? 0;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async findPending(id: string): Promise<VerificationRow> {
    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Verification not found');
    const row = data as VerificationRow;
    if (row.status !== 'pending') {
      throw new BadRequestException(
        `This verification was already ${row.status}`,
      );
    }
    return row;
  }

  private async review(id: string, patch: Record<string, unknown>) {
    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * profiles has no email column — it lives on auth.users, exposed through the
   * service-role-only admin_user_overview view (migration 0005).
   */
  private async emailsFor(ids: string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const { data } = await this.supabase.admin
      .from('admin_user_overview')
      .select('id, email')
      .in('id', unique);
    return new Map(
      (data ?? []).map((r: { id: string; email: string | null }) => [
        r.id,
        r.email,
      ]),
    );
  }

  /**
   * Documents are returned as short-lived signed URLs — the bucket is private
   * because these are government IDs.
   */
  private async shape(
    row: VerificationRow,
    emails: Map<string, string | null>,
  ) {
    // Stripe Identity rows carry no paths — their documents were collected and
    // retained by Stripe — so `documents` is legitimately empty for them and
    // the admin console has nothing to display but the outcome.
    const paths = [row.id_document_path, row.selfie_path].filter(
      (p): p is string => p !== null,
    );
    const documents = (
      await Promise.all(
        paths.map((p) =>
          this.uploads.signedDownloadUrl(VERIFICATION_DOCS_BUCKET, p),
        ),
      )
    ).filter((url): url is string => url !== null);

    return {
      id: row.id,
      provider_id: row.provider_id,
      full_name: row.profiles?.full_name ?? null,
      email: emails.get(row.provider_id) ?? null,
      status: row.status,
      method: row.method,
      submitted_at: row.submitted_at,
      reviewed_at: row.reviewed_at,
      rejection_reason: row.rejection_reason,
      documents,
    };
  }

  private async notify(recipientId: string, title: string, body: string) {
    await this.supabase.admin.from('notifications').insert({
      recipient_id: recipientId,
      type: 'verification_update',
      title,
      body,
      data: {},
    });
  }
}
