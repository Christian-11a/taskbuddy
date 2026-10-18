import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import { StripeService } from '../payments/stripe.service';
import { resolveMobileApiVersion } from '../payments/stripe-api-version';
import { AdminActionsService } from '../admin/admin-actions.service';
import { VERIFICATION_DOCS_BUCKET } from '../uploads/uploads.constants';
import {
  ListVerificationsQueryDto,
  RejectVerificationDto,
  StartIdentitySessionDto,
  SubmitVerificationDto,
} from './dto/verifications.dto';
import type { Profile, VerificationMethod } from '../common/types';

/**
 * API version for the Identity ephemeral key. Pinned separately from this
 * server's own calls because it is the mobile SDK, not this server, that
 * consumes the key. Override when @stripe/stripe-react-native requires a newer
 * one.
 */
const IDENTITY_API_VERSION = resolveMobileApiVersion(
  process.env.STRIPE_MOBILE_API_VERSION,
  (msg) => new Logger('StripeApiVersion').warn(msg),
);

/**
 * Row shape as stored. Document paths are null on Stripe Identity rows — those
 * documents live in Stripe and are never sent to us (migration 0013).
 */
interface VerificationRow {
  id: string;
  provider_id: string;
  id_document_path: string | null;
  selfie_path: string | null;
  document_type: string | null;
  method: VerificationMethod;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  profiles?: { full_name: string } | null;
}

/** stripe-node errors carry a `type` such as 'StripeInvalidRequestError'. */
function isStripeError(e: unknown): boolean {
  const type = (e as { type?: unknown } | null)?.type;
  return typeof type === 'string' && type.startsWith('Stripe');
}

/**
 * `is_verified` lives on provider_profiles, which only exists once the provider
 * has picked a service. Approving without it used to mark the review approved
 * while the flag had nowhere to land (BACKEND_SCHEMA.md §17).
 */
const PROFILE_MISSING_FOR_APPROVAL =
  'This provider has not set up their service profile yet, so there is nothing to mark verified. Ask them to complete Edit Profile, then approve.';

type CertificateState =
  'none' | 'pending' | 'approved' | 'rejected' | 'expired';

type IdentityDecision = {
  provider_id: string;
  status: 'approved' | 'rejected';
  identity_verified: boolean;
  verified: boolean;
  primary_certificate_valid: boolean;
  has_pending_certificate: boolean;
};

/** Maps the TB4xx codes raised by the decide_* SQL functions to HTTP errors. */
const rpcError = (error: { code?: string; message: string }) =>
  error.code === 'TB404'
    ? new NotFoundException(error.message)
    : error.code === 'TB409'
      ? new ConflictException(error.message)
      : new BadRequestException(error.message);

const nameParts = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/** Every part of the verified name appears among the profile name's parts. */
export function namesMatch(verified: string, profile: string): boolean {
  const wanted = nameParts(verified);
  const have = new Set(nameParts(profile));
  return wanted.length > 0 && wanted.every((part) => have.has(part));
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
    await this.assertProviderProfile(user.id);

    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .insert({
        provider_id: user.id,
        id_document_path: dto.id_document_path,
        selfie_path: dto.selfie_path,
        document_type: dto.document_type ?? null,
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
   *
   * When the caller supplies document paths (the mobile three-step flow does:
   * ID, then selfie, then this), they are stored on the same row. Stripe still
   * decides; the images are the fallback that lets an admin finish the review
   * by hand if Identity never returns a verdict. `method` stays
   * 'stripe_identity' — the CHECK from 0013 only insists that *manual* rows
   * carry documents, not that Identity rows carry none.
   */
  async startIdentitySession(user: Profile, dto: StartIdentitySessionDto = {}) {
    const stripe = this.stripe.stripe;

    const documentPaths = [dto.id_document_path, dto.selfie_path].filter(
      (p): p is string => !!p,
    );
    if (documentPaths.length > 0) {
      this.uploads.assertOwnedPaths(user, documentPaths);
      await Promise.all(
        documentPaths.map((p) =>
          this.uploads.assertValidImage(VERIFICATION_DOCS_BUCKET, p),
        ),
      );
    }

    await this.assertProviderProfile(user.id);

    // A Stripe refusal here is this server's configuration (a bad API version,
    // Identity not activated on the account, a wrong key), not the provider's
    // mistake. Stripe answers those with a 400, which the app would show as a
    // dead end; a 503 is what tells it to send the documents to manual review
    // instead, as it already does when Stripe is not configured at all.
    let session: { id: string; url: string | null };
    try {
      session = await stripe.identity.verificationSessions.create({
        type: 'document',
        metadata: { profile_id: user.id },
      });
    } catch (e) {
      throw this.identityUnavailable(e, 'create the Identity session');
    }

    // The mobile SDK drives the session with this key rather than the URL.
    let ephemeralKey: { secret?: string };
    try {
      ephemeralKey = await stripe.ephemeralKeys.create(
        { verification_session: session.id },
        { apiVersion: IDENTITY_API_VERSION },
      );
    } catch (e) {
      // The session already exists at Stripe; don't leave it orphaned.
      if (isStripeError(e)) await this.cancelSessionQuietly(session.id);
      throw this.identityUnavailable(e, 'create the Identity ephemeral key');
    }

    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .insert({
        provider_id: user.id,
        method: 'stripe_identity',
        stripe_session_id: session.id,
        id_document_path: dto.id_document_path ?? null,
        selfie_path: dto.selfie_path ?? null,
        document_type: dto.document_type ?? null,
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

  /** Maps a Stripe failure to a 503 (logged); anything else passes through. */
  private identityUnavailable(e: unknown, step: string): unknown {
    if (!isStripeError(e)) return e;
    this.logger.error(
      `Stripe Identity: could not ${step}: ${(e as Error).message}`,
    );
    return new ServiceUnavailableException(
      'Automated verification is unavailable right now',
    );
  }

  private async cancelSessionQuietly(sessionId: string) {
    try {
      await this.stripe.stripe.identity.verificationSessions.cancel(sessionId);
    } catch (e) {
      this.logger.warn(
        `Could not cancel orphaned Identity session ${sessionId}: ${(e as Error).message}`,
      );
    }
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
    if (
      approved &&
      !(await this.hasProviderProfile(verification.provider_id))
    ) {
      // Returning normally stops Stripe retrying. The row stays pending, so it
      // sits in the admin queue until the provider finishes their profile.
      this.logger.error(
        `Identity verified for ${verification.provider_id}, who has no provider_profiles row; left pending for manual review`,
      );
      return;
    }
    if (
      approved &&
      !(await this.identityNameMatches(sessionId, verification.provider_id))
    ) {
      // The document is genuine but names someone else (or Stripe returned no
      // name). Auto-approving would put a verified badge on the wrong person,
      // so the row stays pending for an admin to compare by hand.
      this.logger.warn(
        `Identity session ${sessionId} verified a name that does not match provider ${verification.provider_id}; left pending for manual review`,
      );
      return;
    }
    try {
      await this.decideIdentity(
        verification.id,
        approved,
        null, // no admin made this call; reviewed_by references profiles
        approved ? null : (reason ?? null),
      );
    } catch (e) {
      if (e instanceof ConflictException) {
        // An admin decided this submission first; theirs stands. Returning
        // normally stops Stripe retrying.
        this.logger.warn(
          `Stripe session ${sessionId}: submission already decided (${e.message}); outcome ignored`,
        );
        return;
      }
      throw e;
    }
  }

  /**
   * Whether the name Stripe read off the document is the account's name: every
   * part of the verified first and last name must appear in the profile's
   * full name, ignoring case, accents and punctuation. Middle names and the
   * order of parts are allowed to differ.
   */
  private async identityNameMatches(
    sessionId: string,
    providerId: string,
  ): Promise<boolean> {
    let outputs: {
      first_name?: string | null;
      last_name?: string | null;
    } | null;
    try {
      const session =
        await this.stripe.stripe.identity.verificationSessions.retrieve(
          sessionId,
          { expand: ['verified_outputs'] },
        );
      outputs = session.verified_outputs ?? null;
    } catch (e) {
      this.logger.error(
        `Could not read verified outputs for ${sessionId}: ${(e as Error).message}`,
      );
      return false;
    }
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('full_name')
      .eq('id', providerId)
      .maybeSingle();
    return namesMatch(
      `${outputs?.first_name ?? ''} ${outputs?.last_name ?? ''}`,
      (profile as { full_name?: string } | null)?.full_name ?? '',
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
    const state = await this.verificationState(
      user.id,
      (data as VerificationRow | null)?.status,
    );
    // Existing row fields stay as they were; identity/certificate/verified are added.
    return { ...((data as VerificationRow | null) ?? {}), ...state };
  }

  /**
   * The two halves of verification (0068). `identity` follows the
   * identity_verified flag, else the latest submission; `certificate` is for
   * the primary service: approved (unexpired) > pending > expired > rejected.
   * `services` lists the primary and every approved secondary service with the
   * same certificate state for each; a service without a valid certificate
   * cannot be worked.
   */
  async verificationState(
    providerId: string,
    latestStatus?: string,
  ): Promise<{
    identity: 'none' | 'pending' | 'approved' | 'rejected';
    certificate: CertificateState;
    verified: boolean;
    services: {
      category_id: number;
      name: string | null;
      primary: boolean;
      certificate: CertificateState;
    }[];
  }> {
    const { data: profile } = await this.supabase.admin
      .from('provider_profiles')
      .select(
        'category_id, is_verified, identity_verified, service_categories(name)',
      )
      .eq('profile_id', providerId)
      .maybeSingle();
    const pp = profile as {
      category_id: number;
      is_verified: boolean | null;
      identity_verified: boolean | null;
      service_categories: { name: string } | null;
    } | null;
    let identity: 'none' | 'pending' | 'approved' | 'rejected' = 'none';
    if (pp?.identity_verified) identity = 'approved';
    else if (latestStatus === 'pending' || latestStatus === 'rejected')
      identity = latestStatus;

    const services: {
      category_id: number;
      name: string | null;
      primary: boolean;
      certificate: CertificateState;
    }[] = [];
    if (pp) {
      const [{ data: creds }, { data: secondary }] = await Promise.all([
        this.supabase.admin
          .from('provider_credentials')
          .select('category_id, status, expires_on')
          .eq('provider_id', providerId),
        this.supabase.admin
          .from('provider_secondary_categories')
          .select('category_id, service_categories(name)')
          .eq('provider_id', providerId),
      ]);
      const today = new Date(Date.now() + 8 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const rows = (creds ?? []) as {
        category_id: number;
        status: string;
        expires_on: string | null;
      }[];
      const stateFor = (categoryId: number): CertificateState => {
        const mine = rows.filter((r) => r.category_id === categoryId);
        if (
          mine.some(
            (r) =>
              r.status === 'approved' &&
              (!r.expires_on || r.expires_on >= today),
          )
        )
          return 'approved';
        if (mine.some((r) => r.status === 'pending')) return 'pending';
        if (mine.some((r) => r.status === 'approved')) return 'expired';
        if (mine.some((r) => r.status === 'rejected')) return 'rejected';
        return 'none';
      };
      services.push({
        category_id: pp.category_id,
        name: pp.service_categories?.name ?? null,
        primary: true,
        certificate: stateFor(pp.category_id),
      });
      for (const sc of (secondary ?? []) as unknown as {
        category_id: number;
        service_categories: { name: string } | null;
      }[]) {
        if (sc.category_id === pp.category_id) continue;
        services.push({
          category_id: sc.category_id,
          name: sc.service_categories?.name ?? null,
          primary: false,
          certificate: stateFor(sc.category_id),
        });
      }
    }
    return {
      identity,
      certificate: services[0]?.certificate ?? 'none',
      verified: pp?.is_verified === true,
      services,
    };
  }

  // ── Admin side ────────────────────────────────────────────────────────────

  /**
   * The admin queue as one case per provider (D5c): the pending ID + selfie
   * submission and the provider's pending certificate together. A pending
   * certificate with no pending submission (Stripe already approved identity,
   * a renewal, a second service) is a certificate-only case.
   *
   * case_type: "New provider" (identity under review, or the provider's first
   * ever certificate), "Certificate renewal: <service>" (an approved
   * certificate for that service already existed), "New service certificate:
   * <service>" (identity done, certificates exist only for other services).
   */
  async listCases(query: { limit?: number; offset?: number }) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const { data: vData, error: vError } = await this.supabase.admin
      .from('provider_verifications')
      .select('*, profiles!provider_verifications_provider_id_fkey(full_name)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true });
    if (vError) throw new BadRequestException(vError.message);
    const { data: cData, error: cError } = await this.supabase.admin
      .from('provider_credentials')
      .select(
        'id, provider_id, category_id, credential_type, title, issuer, credential_number, issued_on, expires_on, document_path, created_at, service_categories(id, name), provider_profiles!provider_credentials_provider_id_fkey(category_id, identity_verified, profiles(full_name))',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (cError) throw new BadRequestException(cError.message);

    type CredRow = {
      id: string;
      provider_id: string;
      category_id: number;
      document_path: string;
      created_at: string;
      service_categories: { id: number; name: string } | null;
      provider_profiles: {
        category_id: number;
        identity_verified: boolean | null;
        profiles: { full_name: string } | null;
      } | null;
      [key: string]: unknown;
    };
    const verifications = (vData ?? []) as VerificationRow[];
    const credentials = (cData ?? []) as unknown as CredRow[];

    const providerIds = [
      ...new Set([
        ...verifications.map((v) => v.provider_id),
        ...credentials.map((c) => c.provider_id),
      ]),
    ];
    const { data: approvedData } = providerIds.length
      ? await this.supabase.admin
          .from('provider_credentials')
          .select('provider_id, category_id')
          .eq('status', 'approved')
          .in('provider_id', providerIds)
      : { data: [] };
    const approved = (approvedData ?? []) as {
      provider_id: string;
      category_id: number;
    }[];
    const emails = await this.emailsFor(providerIds);

    const usedCredentials = new Set<string>();
    const cases: {
      sortKey: string;
      verification: VerificationRow | null;
      credential: CredRow | null;
    }[] = [];
    for (const v of verifications) {
      const own = credentials.filter((c) => c.provider_id === v.provider_id);
      const credential =
        own.find((c) => c.category_id === c.provider_profiles?.category_id) ??
        own[0] ??
        null;
      if (credential) usedCredentials.add(credential.id);
      cases.push({
        sortKey: v.submitted_at,
        verification: v,
        credential,
      });
    }
    for (const c of credentials) {
      if (!usedCredentials.has(c.id))
        cases.push({
          sortKey: c.created_at,
          verification: null,
          credential: c,
        });
    }
    cases.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const page = cases.slice(offset, offset + limit);
    const shaped = await Promise.all(
      page.map(async ({ verification, credential }) => {
        const providerId = (verification?.provider_id ??
          credential?.provider_id) as string;
        const service = credential?.service_categories?.name ?? null;
        const history = approved.filter((a) => a.provider_id === providerId);
        let caseType = 'New provider';
        if (!verification && credential) {
          if (history.some((a) => a.category_id === credential.category_id))
            caseType = `Certificate renewal: ${service ?? 'service'}`;
          else if (history.length > 0)
            caseType = `New service certificate: ${service ?? 'service'}`;
        }
        const shapedVerification = verification
          ? await this.shape(verification, emails, true)
          : null;
        let shapedCredential: Record<string, unknown> | null = null;
        if (credential) {
          const { document_path, provider_profiles, ...rest } = credential;
          void provider_profiles;
          shapedCredential = {
            ...rest,
            document_url: await this.uploads.signedDownloadUrl(
              'provider-credentials',
              document_path,
              3600,
            ),
          };
        }
        return {
          case_id: verification?.id ?? credential?.id,
          case_type: caseType,
          provider_id: providerId,
          full_name:
            verification?.profiles?.full_name ??
            credential?.provider_profiles?.profiles?.full_name ??
            null,
          email: emails.get(providerId) ?? null,
          identity: verification
            ? 'pending'
            : credential?.provider_profiles?.identity_verified
              ? 'approved'
              : 'none',
          verification: shapedVerification,
          credential: shapedCredential,
        };
      }),
    );
    return { cases: shaped, total: cases.length };
  }

  /**
   * One decision for a whole case, applied in a single SQL transaction
   * (admin_decide_verification_case, 0068).
   */
  async decideCase(
    admin: Profile,
    dto: {
      verification_id?: string;
      credential_id?: string;
      decision: 'approve' | 'reject';
      failed_parts?: string[];
      note?: string;
    },
  ) {
    const { data, error } = await this.supabase.admin.rpc(
      'admin_decide_verification_case',
      {
        p_admin: admin.id,
        p_verification_id: dto.verification_id ?? null,
        p_credential_id: dto.credential_id ?? null,
        p_decision: dto.decision,
        p_failed: dto.failed_parts ?? [],
        p_note: dto.note ?? null,
      },
    );
    if (error) throw rpcError(error);
    return data;
  }

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
    const includeDocuments = query.include_documents !== 'false';
    const verifications = await Promise.all(
      rows.map((row) => this.shape(row, emails, includeDocuments)),
    );
    return { verifications, total: count ?? 0 };
  }

  async getForAdmin(id: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .select('*, profiles!provider_verifications_provider_id_fkey(full_name)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Verification not found');
    const row = data as VerificationRow;
    const emails = await this.emailsFor([row.provider_id]);
    return this.shape(row, emails, true);
  }

  async approve(admin: Profile, id: string) {
    // One SQL transaction: pending-only status change, identity_verified, the
    // is_verified refresh, the admin audit row and the provider's notice.
    // A decided row is never overwritten (409).
    await this.decideIdentity(id, true, admin.id, null);
    return this.rawRow(id);
  }

  async reject(admin: Profile, id: string, dto: RejectVerificationDto) {
    // The "Verification needs changes" notice is always sent by the function.
    await this.decideIdentity(id, false, admin.id, dto.reason ?? null);
    return this.rawRow(id);
  }

  private async rawRow(id: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_verifications')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
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

  private async hasProviderProfile(providerId: string): Promise<boolean> {
    const { data, error } = await this.supabase.admin
      .from('provider_profiles')
      .select('profile_id')
      .eq('profile_id', providerId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return !!data;
  }

  /** Verification without a service profile could never land (see approve). */
  private async assertProviderProfile(providerId: string) {
    if (!(await this.hasProviderProfile(providerId))) {
      throw new ConflictException(
        'Finish your profile first — pick your service and add a bio in Edit Profile — then verify your ID.',
      );
    }
  }

  /**
   * Identity decision through decide_identity_verification (0068): status
   * change (only while pending), identity_verified and the is_verified
   * refresh in one transaction.
   */
  private async decideIdentity(
    verificationId: string,
    approve: boolean,
    reviewedBy: string | null,
    reason: string | null,
  ): Promise<IdentityDecision> {
    const { data, error } = await this.supabase.admin.rpc(
      'decide_identity_verification',
      {
        p_verification_id: verificationId,
        p_approve: approve,
        p_reviewed_by: reviewedBy,
        p_reason: reason,
      },
    );
    if (error) throw rpcError(error);
    return data as IdentityDecision;
  }

  /**
   * After identity passes: verified, or told what is still missing. Skips the
   * upload nudge when a certificate is already waiting for an admin.
   */
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
    includeDocuments: boolean,
  ) {
    // Stripe Identity rows carry no paths — their documents were collected and
    // retained by Stripe — so `documents` is legitimately empty for them and
    // the admin console has nothing to display but the outcome.
    const paths = [row.id_document_path, row.selfie_path].filter(
      (p): p is string => p !== null,
    );
    const documents = !includeDocuments
      ? []
      : (
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
      document_type: row.document_type ?? null,
      submitted_at: row.submitted_at,
      reviewed_at: row.reviewed_at,
      rejection_reason: row.rejection_reason,
      documents,
    };
  }

  private async notify(recipientId: string, title: string, body: string) {
    const { error: notificationError } = await this.supabase.admin
      .from('notifications')
      .insert({
        recipient_id: recipientId,
        type: 'verification_update',
        title,
        body,
        data: {},
      });
    if (notificationError)
      this.logger.error(
        `Notification not written: ${notificationError.message}`,
      );
  }
}
