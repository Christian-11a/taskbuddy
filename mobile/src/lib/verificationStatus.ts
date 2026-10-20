/**
 * Pure helpers for the two-part verification: an ID check (identity) and a
 * certificate for the service. Read `GET /verifications/me`. An older API
 * without `identity`/`certificate`/`verified` falls back to the single
 * `status === 'approved'` rule.
 */
import type { CertificateState, Credential, IdentityState, Verification } from './api';

export type VerificationMe = Partial<Verification> | null | undefined;
export type MissingPart = 'identity' | 'certificate';

export interface VerificationSummary {
  verified: boolean;
  identity: IdentityState;
  certificate: CertificateState;
  headline: string;
  detail: string;
  missing: MissingPart[];
}

export function hasNewShape(me: VerificationMe): boolean {
  return !!me && (me.verified !== undefined || me.identity !== undefined || me.certificate !== undefined);
}

function identityOf(me: VerificationMe): IdentityState {
  if (!me) return 'none';
  if (me.identity) return me.identity;
  return me.status ?? 'none';
}

/** Old API: approved means verified. */
function legacyVerified(me: VerificationMe): boolean {
  return me?.status === 'approved';
}

export function verificationSummary(me: VerificationMe): VerificationSummary {
  const identity = identityOf(me);
  if (!hasNewShape(me)) {
    const verified = legacyVerified(me);
    return {
      verified,
      identity,
      certificate: verified ? 'approved' : 'none',
      headline: verified ? "You're verified" : identity === 'pending' ? 'ID under review' : 'Get verified',
      detail: verified ? 'You can send proposals.' : identity === 'pending' ? 'An admin is checking your ID.' : 'Add your ID and a selfie.',
      missing: verified ? [] : ['identity'],
    };
  }
  const certificate: CertificateState = me?.certificate ?? 'none';
  const verified = me?.verified === true;
  if (verified) {
    return { verified, identity, certificate, headline: "You're verified", detail: 'Your ID and certificate are approved.', missing: [] };
  }
  const missing: MissingPart[] = [];
  if (identity !== 'approved') missing.push('identity');
  if (certificate !== 'approved') missing.push('certificate');

  if (identity !== 'approved') {
    if (identity === 'pending') return { verified, identity, certificate, headline: 'ID under review', detail: 'An admin is checking your ID.', missing };
    if (identity === 'rejected') return { verified, identity, certificate, headline: 'ID not accepted', detail: 'Upload new photos to try again.', missing };
    return { verified, identity, certificate, headline: 'Get verified', detail: 'Add your ID and a selfie, then a certificate for your service.', missing };
  }
  const CERT: Record<Exclude<CertificateState, 'approved'>, [string, string]> = {
    none: ['ID approved · certificate needed', 'Upload a certificate for your service.'],
    pending: ['ID approved · certificate under review', 'An admin is checking your certificate.'],
    expired: ['ID approved · certificate expired', 'Upload a renewed certificate.'],
    rejected: ['ID approved · certificate not accepted', 'Upload a new certificate.'],
  };
  const [headline, detail] = CERT[certificate === 'approved' ? 'none' : certificate];
  return { verified, identity, certificate, headline, detail, missing };
}

/**
 * Whether the provider can send proposals for a service: ID approved and that
 * service's certificate approved (extra services count; the primary is not required).
 */
export function canWorkService(me: VerificationMe, categoryId: number | null | undefined): boolean {
  if (!me) return false;
  if (!hasNewShape(me)) return legacyVerified(me);
  if (identityOf(me) !== 'approved') return false;
  const service = me.services?.find((s) => s.category_id === categoryId);
  if (service) return service.certificate === 'approved';
  // No services list: only the overall flag is known.
  return me.services === undefined ? me.verified === true : false;
}

export interface ProfileVerificationFlags { verified: boolean; identityVerified: boolean }

/**
 * Stopgap for the live /verifications/me bug (docs/backend-handoff-smoke-2026-10-19.md section 1): for an approved
 * provider it answers identity 'none' with no services. When the answer has exactly that shape, trust the signed-in
 * profile: `is_verified` (ID + certificate, migration 0068) or `identity_verified` (ID only; the certificate is still
 * missing). Remove once the backend fix is deployed.
 */
export function reconcileVerification(me: VerificationMe, flags: ProfileVerificationFlags): VerificationMe {
  if (!me || me.verified === true) return me;
  const buggyShape = me.identity === 'none' && Array.isArray(me.services) && me.services.length === 0;
  if (!buggyShape) return me;
  // services undefined: canWorkService then falls back to the overall flag.
  if (flags.verified) return { ...me, identity: 'approved', certificate: 'approved', verified: true, services: undefined };
  // ID approved, certificate not yet: the certificate state stays as the server said (the screen also reads credentials).
  if (flags.identityVerified) return { ...me, identity: 'approved', services: undefined };
  return me;
}

export type ExpiryState =
  | { categoryId: number; state: 'ok'; daysLeft: number | null }
  | { categoryId: number; state: 'expiring'; daysLeft: number }
  | { categoryId: number; state: 'expired'; daysLeft: number };

function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Expiry per service, from the provider's credentials. `today` is a
 * YYYY-MM-DD date. A service with several approved certificates uses the one
 * that lasts longest (no expiry date counts as longest). 'expiring' is 30 days
 * or fewer left; 'expired' is past the date, or marked expired with no valid
 * certificate left (daysLeft 0 then).
 */
export function certificateExpiry(
  credentials: readonly Pick<Credential, 'category_id' | 'status' | 'expires_on'>[] | null | undefined,
  today: string,
): ExpiryState[] {
  const now = dayNumber(today);
  const best = new Map<number, number | null>(); // category -> days left (null = no expiry)
  const expiredOnly = new Set<number>();
  for (const c of credentials ?? []) {
    if (c.status === 'expired') { expiredOnly.add(c.category_id); continue; }
    if (c.status !== 'approved') continue;
    const left = c.expires_on ? dayNumber(c.expires_on) - now : null;
    const prev = best.get(c.category_id);
    if (prev === undefined || left === null || (prev !== null && left > prev)) best.set(c.category_id, left);
  }
  const out: ExpiryState[] = [];
  for (const [categoryId, left] of best) {
    if (left === null) out.push({ categoryId, state: 'ok', daysLeft: null });
    else if (left < 0) out.push({ categoryId, state: 'expired', daysLeft: left });
    else if (left <= 30) out.push({ categoryId, state: 'expiring', daysLeft: left });
    else out.push({ categoryId, state: 'ok', daysLeft: left });
  }
  for (const categoryId of expiredOnly) {
    if (!best.has(categoryId)) out.push({ categoryId, state: 'expired', daysLeft: 0 });
  }
  return out;
}

/** What certificate to ask for, by service name. */
export function certificateGuidance(serviceName: string | null | undefined): string {
  const name = (serviceName ?? '').trim().toLowerCase();
  let example: string;
  if (name.includes('plumb')) example = 'TESDA Plumbing NC II';
  else if (name.includes('clean')) example = 'TESDA Housekeeping NC II';
  else if (name.includes('handyman')) example = 'TESDA Carpentry or Electrical Installation and Maintenance NC II';
  else if (name.includes('manicure') || name.includes('pedicure')) example = 'TESDA Beauty Care NC II';
  else example = 'a TESDA, PRC or trade certificate that matches the service';
  return `${example}. An admin checks it matches your service.`;
}
