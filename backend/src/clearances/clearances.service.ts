import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import type { Profile } from '../common/types';
import type { RevokeVerificationDto } from '../verifications/dto/verifications.dto';
import type {
  CreateClearanceDto,
  ListClearancesQueryDto,
  RejectClearanceDto,
} from './dto/clearances.dto';

const BUCKET = 'provider-credentials';
const SELECT =
  'id, provider_id, clearance_type, clearance_number, issued_on, expires_on, document_path, status, rejection_reason, reviewed_at, revoked_at, revoke_reason, created_at';

type ClearanceRow = {
  id: string;
  provider_id: string;
  status: string;
  expires_on: string;
  document_path: string;
  [key: string]: unknown;
};

const today = () =>
  new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** An approved clearance past its expiry date reads as "expired", like certificates. */
const effectiveStatus = (row: ClearanceRow) =>
  row.status === 'approved' && row.expires_on < today()
    ? 'expired'
    : row.status;

/** Maps the TB4xx codes raised by the SQL functions to HTTP errors. */
const rpcError = (error: { code?: string; message: string }) =>
  error.code === 'TB404'
    ? new NotFoundException(error.message)
    : error.code === 'TB409'
      ? new ConflictException(error.message)
      : new BadRequestException(error.message);

export interface DuplicateSignal {
  kind: 'certificate_number' | 'clearance_number' | 'document' | 'phone';
  other_id: string;
  other_name: string | null;
  other_status: 'active' | 'suspended' | 'deleted';
}

/**
 * NBI / police clearances (migration 0082): the provider uploads, an admin
 * approves, rejects or revokes. They count toward Verified only while
 * verification_settings.require_clearance is on. Also serves the duplicate
 * signals shown in the admin Screening panel.
 */
@Injectable()
export class ClearancesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
  ) {}

  // ── Provider side ─────────────────────────────────────────────────────────

  async create(user: Profile, dto: CreateClearanceDto) {
    this.uploads.assertOwnedPaths(user, [dto.document_path]);
    await this.uploads.assertValidImage(BUCKET, dto.document_path);
    if (dto.expires_on < today())
      throw new BadRequestException('This clearance has already expired');
    if (dto.issued_on && dto.issued_on > dto.expires_on)
      throw new BadRequestException('The issue date is after the expiry date');
    const { data, error } = await this.supabase.admin
      .from('provider_clearances')
      .insert({
        ...dto,
        clearance_number: dto.clearance_number.trim(),
        provider_id: user.id,
      })
      .select(SELECT)
      .single();
    if (error?.code === '23505')
      throw new ConflictException('You already have a clearance under review');
    if (error?.code === '23503')
      throw new BadRequestException(
        'Set up your service profile before adding a clearance',
      );
    if (error) throw new BadRequestException(error.message);
    return this.shape(data, true);
  }

  async mine(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('provider_clearances')
      .select(SELECT)
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return Promise.all(
      (data as ClearanceRow[]).map((row) => this.shape(row, true)),
    );
  }

  /** A provider may withdraw a pending or rejected clearance; decided ones stay on record. */
  async remove(user: Profile, id: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_clearances')
      .delete()
      .eq('id', id)
      .eq('provider_id', user.id)
      .in('status', ['pending', 'rejected'])
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data)
      throw new NotFoundException(
        'Clearance not found, or already decided and kept on record',
      );
    return { removed: true };
  }

  /** Whether a clearance is required for Verified right now. */
  async required(): Promise<boolean> {
    const { data, error } = await this.supabase.admin
      .from('verification_settings')
      .select('require_clearance')
      .maybeSingle();
    if (error) return false;
    return (
      (data as { require_clearance?: boolean } | null)?.require_clearance ===
      true
    );
  }

  // ── Admin side ────────────────────────────────────────────────────────────

  async list(query: ListClearancesQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const { data, error, count } = await this.supabase.admin
      .from('provider_clearances')
      .select(
        `${SELECT}, provider_profiles!provider_clearances_provider_id_fkey(profiles(full_name))`,
        { count: 'exact' },
      )
      .eq('status', query.status ?? 'pending')
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new BadRequestException(error.message);
    const clearances = await Promise.all(
      (
        data as unknown as (ClearanceRow & {
          provider_profiles: { profiles: { full_name: string } | null } | null;
        })[]
      ).map(({ provider_profiles, ...row }) =>
        this.shape(
          { ...row, profiles: provider_profiles?.profiles ?? null },
          true,
        ),
      ),
    );
    return { clearances, total: count ?? 0 };
  }

  async approve(admin: Profile, id: string) {
    await this.decide(id, true, admin.id, null);
    return this.shape(await this.fetchRow(id), true);
  }

  async reject(admin: Profile, id: string, dto: RejectClearanceDto) {
    await this.decide(id, false, admin.id, dto.reason.trim());
    return this.shape(await this.fetchRow(id), true);
  }

  /** admin_revoke_verification with kind 'clearance' (0082). */
  async revoke(admin: Profile, id: string, dto: RevokeVerificationDto) {
    const { data, error } = await this.supabase.admin.rpc(
      'admin_revoke_verification',
      {
        p_kind: 'clearance',
        p_id: id,
        p_admin_id: admin.id,
        p_reason: dto.reason.trim(),
      },
    );
    if (error) throw rpcError(error);
    return {
      ...(await this.shape(await this.fetchRow(id), true)),
      revoke: data as { verified: boolean; withdrawn_proposals: number },
    };
  }

  /** Other accounts sharing a certificate or clearance number, a document file, or a phone. */
  async duplicates(userId: string): Promise<DuplicateSignal[]> {
    const { data, error } = await this.supabase.admin.rpc(
      'provider_duplicate_signals',
      { p_provider_id: userId },
    );
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as DuplicateSignal[];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async decide(
    id: string,
    approve: boolean,
    reviewedBy: string,
    reason: string | null,
  ) {
    const { error } = await this.supabase.admin.rpc('decide_clearance', {
      p_clearance_id: id,
      p_approve: approve,
      p_reviewed_by: reviewedBy,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
  }

  private async fetchRow(id: string): Promise<ClearanceRow> {
    const { data, error } = await this.supabase.admin
      .from('provider_clearances')
      .select(SELECT)
      .eq('id', id)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  private async shape(row: ClearanceRow, withDocument: boolean) {
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
}
