import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { VERIFICATION_DOCS_BUCKET } from '../uploads/uploads.constants';
import {
  ListVerificationsQueryDto,
  RejectVerificationDto,
  SubmitVerificationDto,
} from './dto/verifications.dto';
import type { Profile } from '../common/types';

/** Row shape as stored; documents are Storage paths, never URLs. */
interface VerificationRow {
  id: string;
  provider_id: string;
  id_document_path: string;
  selfie_path: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  profiles?: { full_name: string } | null;
}

@Injectable()
export class VerificationsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
  ) {}

  // ── Provider side ─────────────────────────────────────────────────────────

  async submit(user: Profile, dto: SubmitVerificationDto) {
    this.uploads.assertOwnedPaths(user, [
      dto.id_document_path,
      dto.selfie_path,
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
    const documents = (
      await Promise.all(
        [row.id_document_path, row.selfie_path].map((p) =>
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
