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

const BUCKET = 'provider-credentials';
const SELECT =
  'id, provider_id, category_id, credential_type, title, issuer, credential_number, issued_on, expires_on, document_path, status, rejection_reason, reviewed_at, created_at, service_categories(id, name)';

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
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .insert({
        ...dto,
        title: dto.title.trim(),
        issuer: dto.issuer.trim(),
        credential_number: dto.credential_number?.trim() || null,
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

  async mine(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .select(SELECT)
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return Promise.all(
      (data as CredentialRow[]).map((row) => this.shape(row, true)),
    );
  }

  /** A provider may withdraw anything that is not yet approved. */
  async remove(user: Profile, id: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .delete()
      .eq('id', id)
      .eq('provider_id', user.id)
      .neq('status', 'approved')
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data)
      throw new NotFoundException(
        'Credential not found, or already approved and kept on record',
      );
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
