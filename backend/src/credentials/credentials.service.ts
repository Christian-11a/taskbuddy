import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { AdminActionsService } from '../admin/admin-actions.service';
import type { Profile } from '../common/types';
import type {
  CreateCredentialDto,
  ListCredentialsQueryDto,
  RejectCredentialDto,
} from './dto/credentials.dto';
import type { RevokeVerificationDto } from '../verifications/dto/verifications.dto';

const BUCKET = 'provider-credentials';
const SELECT =
  'id, provider_id, category_id, credential_type, title, issuer, credential_number, issued_on, expires_on, document_path, no_expiry, status, rejection_reason, reviewed_at, revoked_at, revoke_reason, created_at, service_categories(id, name)';

type CredentialRow = {
  id: string;
  provider_id: string;
  status: string;
  expires_on: string | null;
  document_path: string;
  [key: string]: unknown;
};

/** Admin list row: the name is embedded via provider_profiles -> profiles. */
type JoinedCredentialRow = CredentialRow & {
  provider_profiles: { profiles: { full_name: string } | null } | null;
};

/** Today in Manila, as the `date` the expiry is compared with. */
/**
 * On once every provider has an app that asks for the expiry (0081). Off, an
 * upload without either answer is still accepted, as the older app sends neither.
 */
export const requireCredentialExpiry = () =>
  process.env.REQUIRE_CREDENTIAL_EXPIRY === 'true';

const today = () =>
  new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/**
 * An approved credential past its expiry date reads as `expired`. Derived
 * on read rather than written by a scheduler, so it is never a tick late.
 */
const effectiveStatus = (row: CredentialRow) =>
  row.status === 'approved' && row.expires_on && row.expires_on < today()
    ? 'expired'
    : row.status;

/** A revoked row as an older app understands it: rejected, with the revoke reason. */
export function asRejectedForOldApps<T extends Record<string, unknown>>(
  row: T,
): T {
  if (row.status !== 'revoked') return row;
  return {
    ...row,
    status: 'rejected',
    rejection_reason: row.revoke_reason ?? row.rejection_reason ?? null,
  };
}

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
    private readonly adminActions: AdminActionsService,
  ) {}

  // ── Provider side ─────────────────────────────────────────────────────────

  async create(user: Profile, dto: CreateCredentialDto) {
    this.uploads.assertOwnedPaths(user, [dto.document_path]);
    await this.uploads.assertValidImage(BUCKET, dto.document_path);
    if (dto.expires_on && dto.expires_on < today())
      throw new BadRequestException('This credential has already expired');
    if (dto.expires_on && dto.no_expiry)
      throw new BadRequestException(
        'Pick the expiry date or say it has none, not both',
      );
    if (requireCredentialExpiry() && !dto.expires_on && !dto.no_expiry)
      throw new BadRequestException(
        'Add the expiry date printed on the certificate, or say it has no expiry date',
      );
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .insert({
        ...dto,
        title: dto.title.trim(),
        issuer: dto.issuer.trim(),
        credential_number: dto.credential_number?.trim() || null,
        no_expiry: dto.no_expiry === true,
        provider_id: user.id,
      })
      .select(SELECT)
      .single();
    if (error?.code === 'TB409') throw new ConflictException(error.message);
    if (error?.code === '23503')
      throw new BadRequestException(
        'Set up your service profile before adding credentials',
      );
    if (error) throw new BadRequestException(error.message);
    return this.shape(data, true);
  }

  /**
   * `revokedAware`: the app sent `X-Client-Features: revoked-status`. Older
   * apps do not know 'revoked', so they get it as 'rejected' with the revoke
   * reason as the rejection reason.
   */
  async mine(user: Profile, revokedAware = true) {
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .select(SELECT)
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    const rows = await Promise.all(
      (data as CredentialRow[]).map((row) => this.shape(row, true)),
    );
    return revokedAware ? rows : rows.map(asRejectedForOldApps);
  }

  /** A provider may withdraw a pending or rejected one; approved and revoked ones stay on record. */
  async remove(user: Profile, id: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .delete()
      .eq('id', id)
      .eq('provider_id', user.id)
      .in('status', ['pending', 'rejected'])
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) {
      // An older app shows a revoked certificate as rejected and offers
      // Remove; say why it stays instead of "not found".
      const { data: kept } = await this.supabase.admin
        .from('provider_credentials')
        .select('status')
        .eq('id', id)
        .eq('provider_id', user.id)
        .maybeSingle();
      if ((kept as { status?: string } | null)?.status === 'revoked')
        throw new ConflictException(
          'This certificate was revoked by an admin and stays on record. Upload a new one instead.',
        );
      throw new NotFoundException(
        'Credential not found, or already decided and kept on record',
      );
    }
    return { removed: true };
  }

  /**
   * What a client sees on a provider's profile: approved, unexpired
   * credentials only, and never the document itself.
   */
  async publicFor(providerId: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .select(
        'id, category_id, credential_type, title, issuer, issued_on, expires_on, status, service_categories(id, name)',
      )
      .eq('provider_id', providerId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data as unknown as CredentialRow[])
      .filter((row) => effectiveStatus(row) === 'approved')
      .map(({ status: _status, ...row }) => row);
  }

  // ── Admin side ────────────────────────────────────────────────────────────

  async list(query: ListCredentialsQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    let request = this.supabase.admin
      .from('provider_credentials')
      .select(
        `${SELECT}, provider_profiles!provider_credentials_provider_id_fkey(profiles(full_name))`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    request = request.eq('status', query.status ?? 'pending');
    const { data, error, count } = await request;
    if (error) throw new BadRequestException(error.message);
    const credentials = await Promise.all(
      (data as unknown as JoinedCredentialRow[]).map(
        ({ provider_profiles, ...row }) =>
          this.shape(
            { ...row, profiles: provider_profiles?.profiles ?? null },
            true,
          ),
      ),
    );
    return { credentials, total: count ?? 0 };
  }

  async approve(admin: Profile, id: string) {
    // Status change, refresh, audit row and notice in one SQL transaction.
    await this.decide(id, true, admin.id, null);
    return this.shape(await this.fetchRow(id), true);
  }

  async reject(admin: Profile, id: string, dto: RejectCredentialDto) {
    await this.decide(id, false, admin.id, dto.reason.trim());
    return this.shape(await this.fetchRow(id), true);
  }

  /**
   * Takes back an approved certificate (0080) in one SQL transaction: status,
   * Verified refresh, withdrawn proposals, audit row and the provider's notice.
   */
  async revoke(admin: Profile, id: string, dto: RevokeVerificationDto) {
    const { data, error } = await this.supabase.admin.rpc(
      'admin_revoke_verification',
      {
        p_kind: 'credential',
        p_id: id,
        p_admin_id: admin.id,
        p_reason: dto.reason.trim(),
      },
    );
    if (error) {
      if (error.code === 'TB404') throw new NotFoundException(error.message);
      if (error.code === 'TB409') throw new ConflictException(error.message);
      throw new BadRequestException(error.message);
    }
    return {
      ...(await this.shape(await this.fetchRow(id), true)),
      revoke: data as { verified: boolean; withdrawn_proposals: number },
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** decide_credential (0068): save + refresh in one transaction. */
  private async decide(
    id: string,
    approve: boolean,
    reviewedBy: string,
    reason: string | null,
  ) {
    const { data, error } = await this.supabase.admin.rpc('decide_credential', {
      p_credential_id: id,
      p_approve: approve,
      p_reviewed_by: reviewedBy,
      p_reason: reason,
    });
    if (error) {
      if (error.code === 'TB404') throw new NotFoundException(error.message);
      if (error.code === 'TB409') throw new ConflictException(error.message);
      throw new BadRequestException(error.message);
    }
    return data as {
      provider_id: string;
      title: string;
      category_id: number;
      is_primary: boolean;
      identity_verified: boolean;
      verified: boolean;
      primary_certificate_valid: boolean;
      has_pending_primary_certificate: boolean;
    };
  }

  private async fetchRow(id: string): Promise<CredentialRow> {
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .select(SELECT)
      .eq('id', id)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data as unknown as CredentialRow;
  }

  private async shape(row: CredentialRow, withDocument: boolean) {
    const { document_path, ...rest } = row;
    const shaped: Record<string, unknown> = {
      ...rest,
      status: effectiveStatus(row),
    };
    if (withDocument)
      shaped.document_url = await this.uploads.signedDownloadUrl(
        BUCKET,
        document_path,
        3600,
      );
    return shaped;
  }

  private async notify(recipientId: string, title: string, body: string) {
    const { error } = await this.supabase.admin.from('notifications').insert({
      recipient_id: recipientId,
      type: 'verification_update',
      title,
      body,
      data: {},
    });
    if (error) this.logger.error(`Notification not written: ${error.message}`);
  }
}
