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
        `${SELECT}, profiles!provider_credentials_provider_id_fkey(full_name)`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    request = request.eq('status', query.status ?? 'pending');
    const { data, error, count } = await request;
    if (error) throw new BadRequestException(error.message);
    const credentials = await Promise.all(
      (data as CredentialRow[]).map((row) => this.shape(row, true)),
    );
    return { credentials, total: count ?? 0 };
  }

  async approve(admin: Profile, id: string) {
    const row = await this.review(
      id,
      {
        status: 'approved',
        rejection_reason: null,
      },
      admin,
    );
    await this.adminActions.record(
      admin,
      'credential.approve',
      'provider_credentials',
      id,
    );
    await this.notify(
      row.provider_id,
      'Credential approved',
      `Your ${String(row.title)} is verified. It now shows as a Certified badge on that service.`,
    );
    return this.shape(row, true);
  }

  async reject(admin: Profile, id: string, dto: RejectCredentialDto) {
    const row = await this.review(
      id,
      {
        status: 'rejected',
        rejection_reason: dto.reason.trim(),
      },
      admin,
    );
    await this.adminActions.record(
      admin,
      'credential.reject',
      'provider_credentials',
      id,
      { reason: dto.reason.trim() },
    );
    await this.notify(
      row.provider_id,
      'Credential not accepted',
      dto.reason.trim(),
    );
    return this.shape(row, true);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Writes a decision on a pending row only, so a double click is a 409. */
  private async review(
    id: string,
    patch: Record<string, unknown>,
    admin: Profile,
  ): Promise<CredentialRow> {
    const { data, error } = await this.supabase.admin
      .from('provider_credentials')
      .update({
        ...patch,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select(SELECT)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data)
      throw new ConflictException('Credential not found or already reviewed');
    return data;
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
