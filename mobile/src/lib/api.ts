/**
 * api.ts — client for the TaskBuddy NestJS backend.
 *
 * Per the backend architecture, the mobile app talks ONLY to the NestJS API
 * (not to Supabase directly). NestJS wraps Supabase Auth + Postgres and returns
 * plain JSON.
 *
 * Base URL: EXPO_PUBLIC_API_URL is the primary and defaults to the deployed
 * Render instance. EXPO_PUBLIC_API_URL_FALLBACK, when set, is used only if the
 * primary fails a health check at startup — so a laptop can keep working
 * against a local backend when the deployed one is down, without editing files.
 *
 * Auth: AuthContext registers a token accessor + refresher via configureApiAuth().
 * Authenticated calls attach the bearer token automatically and retry once after
 * refreshing on a 401, so screens never handle tokens themselves.
 */

import EventSource from 'react-native-sse';

const PRIMARY_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://taskbuddy-kpek.onrender.com';

/** Optional second choice, tried only when the primary is unreachable. */
const FALLBACK_API_URL = process.env.EXPO_PUBLIC_API_URL_FALLBACK ?? null;

/**
 * How long to wait before concluding the primary is merely *slow* rather than
 * down. Render's free tier sleeps and a cold start has been measured at ~55s,
 * so a timeout here is NOT evidence of an outage — see `probe`.
 */
const PRIMARY_PROBE_TIMEOUT_MS = 10000;
const FALLBACK_PROBE_TIMEOUT_MS = 2500;

/**
 * The URL in force. Starts as the primary so anything reading it before the
 * probe finishes reports the intended backend rather than a guess.
 */
let activeBaseUrl = PRIMARY_API_URL;

/** Memoised so the probe runs once per app launch, not once per request. */
let resolution: Promise<string> | null = null;

/** True when the app is running against the fallback — surfaced for display. */
export function isUsingFallbackApi(): boolean {
  return activeBaseUrl !== PRIMARY_API_URL;
}

/** The base URL currently in use. Meaningful only after the first request. */
export function getApiBaseUrl(): string {
  return activeBaseUrl;
}

/**
 * 'slow' is the interesting one. A sleeping Render instance accepts the
 * connection and holds it open while it wakes, so it presents as a timeout,
 * whereas a backend that is genuinely absent — wrong URL, no server, no route
 * to host — fails fast with a network error. Treating those two the same is
 * what would send every cold start to the fallback.
 */
type ProbeResult = 'ok' | 'slow' | 'unreachable';

async function probe(baseUrl: string, timeoutMs: number): Promise<ProbeResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
    });
    return response.ok ? 'ok' : 'unreachable';
  } catch {
    return timedOut ? 'slow' : 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chooses the backend for this app launch.
 *
 * Deliberately loud and one-shot. Silently drifting between backends is how you
 * end up testing code you did not deploy, so the choice is made once, logged,
 * and never revisited mid-session. Falling back is a development convenience,
 * not a high-availability mechanism — both backends share one Supabase project,
 * so this changes which API serves the data, never which data exists.
 */
async function resolveBaseUrl(): Promise<string> {
  if (!FALLBACK_API_URL) return PRIMARY_API_URL;

  const primary = await probe(PRIMARY_API_URL, PRIMARY_PROBE_TIMEOUT_MS);

  if (primary === 'ok') {
    console.log(`[api] using ${PRIMARY_API_URL}`);
    return PRIMARY_API_URL;
  }

  if (primary === 'slow') {
    // Almost certainly a cold start, not an outage. Stay put and let the first
    // real request wait it out — switching here would silently move a whole
    // session onto the local backend just because Render had gone to sleep.
    console.log(
      `[api] ${PRIMARY_API_URL} slow to answer (likely a cold start) — staying on it`,
    );
    return PRIMARY_API_URL;
  }

  if ((await probe(FALLBACK_API_URL, FALLBACK_PROBE_TIMEOUT_MS)) === 'ok') {
    console.warn(
      `[api] ${PRIMARY_API_URL} unreachable — falling back to ${FALLBACK_API_URL}`,
    );
    return FALLBACK_API_URL;
  }

  // Neither answered. Stay on the primary so errors name the backend the app is
  // actually meant to be talking to.
  console.warn(
    `[api] neither ${PRIMARY_API_URL} nor ${FALLBACK_API_URL} answered — staying on primary`,
  );
  return PRIMARY_API_URL;
}

/** Resolves the base URL, probing once and reusing the answer thereafter. */
export async function ensureApiBaseUrl(): Promise<string> {
  resolution ??= resolveBaseUrl().then((url) => {
    activeBaseUrl = url;
    return url;
  });
  return resolution;
}

// ── Backend role vocabulary ↔ mobile role vocabulary ───────────────────────────
// The backend calls homeowners "client"; the mobile UI calls them "homeowner".
export type BackendRole = 'client' | 'provider' | 'admin';
export type MobileRole = 'homeowner' | 'provider';

export function toBackendRole(role: MobileRole): 'client' | 'provider' {
  return role === 'homeowner' ? 'client' : 'provider';
}

export function toMobileRole(role: BackendRole): MobileRole {
  // Admins have no dedicated mobile experience; treat them as homeowners.
  return role === 'provider' ? 'provider' : 'homeowner';
}

// ── Response shapes (subset of what the backend returns) ───────────────────────
export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface RegisterResponse {
  user: AuthUser;
  session: Session | null; // null when email confirmation is required
}

export interface GoogleSignInResponse {
  user: AuthUser;
  session: Session;
}

export interface LoginResponse {
  user: AuthUser;
  session: Session;
}

export interface Profile {
  id: string;
  role: BackendRole;
  email?: string | null;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  // Signup consent timestamps (null for pre-migration accounts)
  consented_terms_at: string | null;
  consented_privacy_at: string | null;
  consented_data_collection_at: string | null;
  consented_biometric_at: string | null;
  // Category stored at SP signup before provider_profiles row exists
  signup_category_id: number | null;
  // True for new Google OAuth users until they complete role selection
  google_signup_pending: boolean;
  [key: string]: unknown;
}

export interface ProviderProfile {
  profile_id: string;
  category_id: number;
  bio: string | null;
  years_experience: number;
  is_available: boolean;
  is_verified: boolean;
  service_radius_km: number;
  cached_avg_rating: number | null;
  cached_ratings_count: number;
  cached_completed_jobs: number;
  service_categories?: { name: string } | null;
  [key: string]: unknown;
}

/**
 * One proposal on a client's job, as `GET /jobs/:id/applications` returns it.
 * The provider's stats ride along nested under `provider.provider_profiles`,
 * because `job_applications.provider_id` references `profiles`, and
 * `provider_profiles` hangs off that row one-to-one.
 */
export interface JobApplication {
  id: string;
  job_id: string;
  provider_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  source: 'organic' | 'recommended';
  cover_message: string | null;
  applied_at: string;
  decided_at: string | null;
  provider: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    city: string | null;
    provider_profiles: Pick<
      ProviderProfile,
      'is_verified' | 'cached_avg_rating' | 'cached_completed_jobs'
    > | null;
  } | null;
}

export interface MeResponse {
  profile: Profile;
  provider_profile: ProviderProfile | null;
}

/** Public provider card as returned by GET /providers/:id. */
export interface ProviderCard {
  profile_id: string;
  bio: string;
  years_experience: number;
  is_available: boolean;
  service_radius_km: number;
  cached_avg_rating: number | null;
  cached_ratings_count: number;
  cached_completed_jobs: number;
  is_verified?: boolean;
  service_categories?: { name: string } | null;
  profiles?: { full_name: string; avatar_url: string | null; city: string | null } | null;
}

export type SkillRequestType = 'change_primary' | 'add_secondary';

/** A provider's request to change or add a service (`/skill-requests`). */
export interface SkillRequest {
  id: string;
  type: SkillRequestType;
  category_id: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  category?: { id: number; name: string } | null;
}

/** One entry of a provider's recent completed work (`GET /providers/:id/work`). */
export interface ProviderWorkItem {
  id: string;
  title: string;
  completed_at: string | null;
  service_categories?: { name: string } | null;
}

export interface Category {
  id: number;
  name: string;
}

/** A verified address with the coordinates the backend resolved it to. */
export interface GeocodedAddress {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

/**
 * One row of the address field's dropdown. `precise` is false for a city or
 * barangay — usable as a starting point, but not specific enough to post a
 * job with, so the field keeps asking for a street.
 */
export interface AddressSuggestion extends GeocodedAddress {
  precise: boolean;
}

/**
 * One item of a job's checklist (migration 0019). The client picks these when
 * posting the job; the assigned provider ticks them off while working.
 */
export interface JobTask {
  id: string;
  label: string;
  position: number;
  is_done: boolean;
  completed_at: string | null;
}

export interface Job {
  id: string;
  client_id: string;
  category_id: number;
  title: string;
  description: string;
  urgency: 'urgent' | 'normal' | 'flexible';
  status:
    | 'open'
    | 'recommending'
    // 'assigned' = hired, waiting on the provider's answer; 'confirmed' = the
    // provider accepted the booking (migration 0018).
    | 'assigned'
    | 'confirmed'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'expired';
  address: string;
  latitude: number;
  longitude: number;
  posted_at: string;
  assigned_provider_id: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  /** Pricing/scheduling/photos — backend columns, migration 0007. */
  budget: number | null;
  /** Client's preferred start (ISO). Null = ASAP. */
  scheduled_at: string | null;
  /** Storage object paths in the public `job-photos` bucket. */
  photo_urls: string[];
  created_at: string;
  service_categories?: { name: string } | null;
  assigned_provider?: { full_name: string } | null;
  /** The job's checklist, unordered — sort by `position` before rendering. */
  job_tasks?: JobTask[];
  /** A completed job can only receive one homeowner review. */
  has_review?: boolean;
  review?: {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
  } | null;
  /** Km from the provider's location. Present only on the browse feed, and
   *  null there when either side has no coordinates. */
  distance_km?: number | null;
  [key: string]: unknown;
}

/**
 * Per-user preferences (`user_settings`, migration 0011).
 *
 * A user who has never opened Settings has no row and is on the DDL defaults;
 * the backend materialises the row on first read, so this never 404s.
 *
 * `push_enabled` is the only flag anything currently consults (the push
 * scheduler). `email_enabled`/`sms_enabled` are stored honestly but no
 * transport reads them yet, and `dark_mode` is stored but the app has no
 * theme switching to apply it to — see mobile/README.md.
 */
export interface UserSettings {
  profile_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  location_sharing: boolean;
  dark_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignedUpload {
  bucket: string;
  path: string;
  upload_url: string;
  token: string;
}

export interface Verification {
  id: string;
  provider_id: string;
  status: 'pending' | 'approved' | 'rejected';
  /** 'manual' = an admin reviews the uploaded documents; 'stripe_identity' =
   *  Stripe decides and the result arrives by webhook (migration 0013). */
  method: 'manual' | 'stripe_identity';
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

/**
 * What the app needs to present a Stripe Identity check. `url` is the hosted
 * flow, which is what Expo Go can open; `ephemeral_key_secret` is for the
 * native SDK, which needs a development build to load.
 */
export interface IdentitySession {
  verification: Verification;
  session_id: string;
  ephemeral_key_secret: string;
  url: string | null;
  publishable_key: string | null;
}

export interface Dispute {
  id: string;
  job_id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'resolved' | 'cancelled';
  resolution: 'released_to_provider' | 'refunded_to_client' | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** Ledger row purpose — see backend/supabase/migrations/0010 and 0021. */
export type WalletTxnKind =
  | 'topup'
  | 'withdrawal'
  | 'escrow_hold'
  | 'payout'
  | 'refund'
  | 'adjustment'
  | 'recovery_credit'
  /** A card-funded payout sent on to the provider's Stripe account (migration 0027). */
  | 'connect_transfer';

/**
 * Where a provider stands with Stripe Connect payouts
 * (`GET /payments/connect`, BACKEND_SCHEMA.md §29):
 *
 * - `not_started` — no payout account yet
 * - `onboarding`  — started Stripe's form but not finished it
 * - `restricted`  — finished, but Stripe still needs something (`requirements_due`)
 * - `active`      — card-paid jobs are sent to their Stripe account automatically
 */
export interface ConnectStatus {
  state: 'not_started' | 'onboarding' | 'restricted' | 'active';
  country: string | null;
  details_submitted: boolean;
  payouts_enabled: boolean;
  transfers_active: boolean;
  requirements_due: string[];
  disabled_reason: string | null;
}

export interface WalletTransaction {
  id: string;
  profile_id: string;
  direction: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'failed';
  amount: number;
  title: string;
  job_id: string | null;
  kind: WalletTxnKind;
  withdrawal_destination?: string | null;
  review_note?: string | null;
  created_at: string;
}

export interface WalletOverview {
  /** Settled credits minus settled debits. */
  balance: number;
  /** Settled balance less money reserved by pending withdrawal requests. */
  available: number;
  total_credited: number;
  total_debited: number;
  pending: number;
  pending_withdrawals: number;
  transactions: WalletTransaction[];
}

export interface RecommendationTriggerResult {
  run_id: string | null;
  pool_size: number;
  notified: number;
}

/** Stripe hosted Checkout session, opened in a browser to fund the wallet. */
export interface CheckoutSession {
  url: string;
  session_id: string;
  amount: number;
}

/** Backend rejects a top-up below this (Stripe's own PHP minimum charge). */
export const MIN_TOPUP_PHP = 20;

/** The most a single card payment may be — the backend's top-up/hire ceiling. */
export const MAX_CARD_PHP = 100_000;

export interface Conversation {
  id: string;
  job_id: string;
  job_title: string | null;
  job_status: string | null;
  counterpart_name: string | null;
  counterpart_avatar_url: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_path: string | null;
  attachment_url: string | null;
  read_at: string | null;
  created_at: string;
}

/** Adds a message or refreshes the existing row without duplicating it. */
export function mergeMessageById(messages: Message[], message: Message): Message[] {
  const existing = messages.findIndex(({ id }) => id === message.id);
  if (existing === -1) return [...messages, message];
  return messages.map((item) => (item.id === message.id ? message : item));
}

export interface Booking {
  id: string;
  job_id: string;
  provider_id: string;
  client_id: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  scheduled_at: string;
  duration_minutes: number;
  notes: string | null;
  jobs?: {
    title: string;
    category_id: number;
    service_categories?: { name: string } | null;
  } | null;
  client?: { full_name: string } | null;
  provider?: { full_name: string } | null;
}

/** Error thrown for any non-2xx response, carrying the backend's message + status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Additional structured error fields returned by the API, when present. */
    readonly details?: unknown,
    /**
     * Seconds the rate limiter asked us to wait, from `Retry-After`. Present
     * only on a 429; the screen shows it so "try again" means something.
     */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * The machine-readable reason some refusals carry alongside their message —
   * `verification_required`, `provider_not_verified`, … — so a screen can offer
   * the way out (a link to Verification, say) instead of parsing prose.
   */
  get code(): string | undefined {
    const code = (this.details as { code?: unknown } | null | undefined)?.code;
    return typeof code === 'string' ? code : undefined;
  }
}

/** Reads a `Retry-After` header in its delta-seconds form; undefined if absent or unparseable. */
function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

/**
 * Why an account cannot be deleted yet. Mirrors the backend's
 * `DeletionBlockerCode` (`backend/src/profiles/dto/account-deletion.ts`).
 */
export type DeletionBlockerCode =
  | 'wallet_balance'
  | 'pending_withdrawal'
  | 'escrow_held'
  | 'active_job'
  | 'open_dispute';

export interface DeletionBlocker {
  code: DeletionBlockerCode;
  /** Written to be shown as-is — says what to do, not just what is wrong. */
  message: string;
}

/**
 * Pulls the blocker list out of a `DELETE /profiles/me` 409.
 *
 * Returns an empty array for any other failure, so a caller can branch on
 * "did this fail because of blockers" without inspecting the status itself.
 */
export function deletionBlockersFrom(err: unknown): DeletionBlocker[] {
  if (!(err instanceof ApiError) || err.status !== 409) return [];
  const blockers = (err.details as { blockers?: unknown } | null)?.blockers;
  return Array.isArray(blockers) ? (blockers as DeletionBlocker[]) : [];
}

/**
 * The upload endpoint only accepts jpeg/png/webp. Expo's image picker hands back
 * a file URI whose extension reflects the original asset; anything unexpected is
 * treated as JPEG, which is what the camera and library produce by default.
 */
function contentTypeFor(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

// ── Auth token registry (wired by AuthContext) ─────────────────────────────────
let getAccessToken: () => string | null = () => null;
let refreshAccessToken: () => Promise<string | null> = async () => null;

export function configureApiAuth(
  accessor: () => string | null,
  refresher: () => Promise<string | null>,
) {
  getAccessToken = accessor;
  refreshAccessToken = refresher;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  accessToken?: string;
}

async function rawRequest<T>(
  path: string,
  options: RequestOptions,
): Promise<T> {
  const { method = 'GET', body, accessToken } = options;

  // Resolves on the first call of the app's life, then returns a settled
  // promise — so this costs one probe, not one per request.
  const baseUrl = await ensureApiBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Cannot reach the server. Check your connection and try again.',
      0,
    );
  }

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body is an error page from something between us and the
    // API — a sleeping Render host, a proxy 502, a captive-portal login. The
    // transport succeeded, so the fetch catch above never fired, and without
    // this the user read "JSON Parse error: Unexpected character: <"
    // (maestro/bug-log.md BUG-001). Surface it as an ApiError with the real
    // status so every caller's existing handling applies.
    throw new ApiError(
      response.ok
        ? 'The server sent a response the app could not read. Please try again.'
        : `The server is unavailable right now (HTTP ${response.status}). Please try again shortly.`,
      response.status,
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      // The rate limiter answered before the request was handled, so nothing
      // happened; say how long to wait rather than the throttler's own text.
      const wait = retryAfterSeconds(response);
      throw new ApiError(
        wait
          ? `Too many attempts. Please try again in ${wait} second${wait === 1 ? '' : 's'}.`
          : 'Too many attempts. Please wait a moment and try again.',
        429,
        data,
        wait,
      );
    }
    const message =
      (data && (Array.isArray(data.message) ? data.message[0] : data.message)) ||
      'Something went wrong. Please try again.';
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

/** Unauthenticated request (auth endpoints). */
function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return rawRequest<T>(path, options);
}

/** Authenticated request: attaches the token, refreshes + retries once on 401. */
async function authRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = getAccessToken();
  try {
    return await rawRequest<T>(path, { ...options, accessToken: token ?? undefined });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return rawRequest<T>(path, { ...options, accessToken: refreshed });
      }
    }
    throw err;
  }
}

export const api = {
  // ── Auth (unauthenticated / explicit-token) ────────────────────────────────
  register(input: {
    email: string;
    password: string;
    role: 'client' | 'provider';
    full_name: string;
    phone?: string;
    /** Skill category (providers only). */
    category_id?: number;
    /** Consent flags — backend converts to timestamptz on the profiles row. */
    consented_terms?: boolean;
    consented_privacy?: boolean;
    consented_data_collection?: boolean;
    consented_biometric?: boolean;
  }) {
    return request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: input,
    });
  },

  /**
   * Completes the profile for a new Google OAuth user after they pick their role
   * and (for providers) fill in extra details.
   */
  completeGoogleProfile(
    token: string,
    input: {
      role: 'client' | 'provider';
      category_id?: number;
      consented_terms?: boolean;
      consented_privacy?: boolean;
      consented_data_collection?: boolean;
      consented_biometric?: boolean;
    },
  ) {
    return request<{ success: true }>('/auth/complete-google-profile', {
      method: 'POST',
      accessToken: token,
      body: input,
    });
  },

  login(input: { email: string; password: string }) {
    return request<LoginResponse>('/auth/login', { method: 'POST', body: input });
  },

  /**
   * Mails a 6-digit signup verification code.
   *
   * Always resolves, even for an address that does not exist or is already
   * confirmed — the backend deliberately does not report which, since an
   * endpoint that says "no such account" is an account-enumeration oracle.
   * So a success here is not evidence the address is real.
   */
  sendEmailOtp(email: string) {
    return request<{ success: true }>('/auth/send-email-otp', {
      method: 'POST',
      body: { email },
    });
  },

  /**
   * Exchanges the emailed code for a confirmed account and a session.
   *
   * A session comes back because the code proves control of the address just
   * as a password would, so the user is signed in rather than bounced to a
   * login screen they just proved they don't need.
   */
  verifyEmailOtp(input: { email: string; token: string }) {
    return request<LoginResponse>('/auth/verify-email-otp', {
      method: 'POST',
      body: input,
    });
  },

  refresh(refresh_token: string) {
    return request<{ session: Session }>('/auth/refresh', {
      method: 'POST',
      body: { refresh_token },
    });
  },

  logout(accessToken: string) {
    return request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      accessToken,
    });
  },

  me(accessToken: string) {
    return request<MeResponse>('/auth/me', { accessToken });
  },

  changePassword(input: { current_password: string; new_password: string }) {
    return authRequest<{ success: boolean }>('/auth/change-password', {
      method: 'POST',
      body: input,
    });
  },

  /**
   * Step 1 of a password reset — mails a 6-digit recovery code.
   *
   * Always resolves, even for an address with no account: the backend answers
   * 200 either way so this can't be used to enumerate who has an account here.
   * That means a success here is "we sent it if it exists", not "that address
   * is valid", and the UI must not claim otherwise.
   */
  forgotPassword(email: string) {
    return request<{ success: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  /**
   * Step 2 — exchanges the emailed code for a session and sets the new
   * password. Returns a session, so the app signs the user straight in rather
   * than bouncing them to Login with a password they just typed twice.
   */
  resetPassword(input: { email: string; token: string; new_password: string }) {
    return request<{ session: Session }>('/auth/reset-password', {
      method: 'POST',
      body: input,
    });
  },

  // ── Settings (per-user preferences, migration 0011) ────────────────────────
  settings() {
    return authRequest<UserSettings>('/settings');
  },

  /**
   * Every field is optional server-side, so send only the toggle that changed.
   * Returns the full row as it now stands.
   */
  updateSettings(input: Partial<Omit<UserSettings, 'profile_id' | 'created_at' | 'updated_at'>>) {
    return authRequest<UserSettings>('/settings', { method: 'PATCH', body: input });
  },

  /**
   * Returns the backend URL that kicks off the server-side Google OAuth flow.
   * The browser (via WebBrowser.openAuthSessionAsync) opens this URL; the
   * backend redirects to Google, handles the callback, and finally redirects
   * back to appRedirect with session tokens in the query string.
   */
  async getGoogleAuthorizeUrl(
    appRedirect: string,
    handoffId?: string,
  ): Promise<string> {
    // Async so sign-in cannot open the browser against one backend while the
    // rest of the app has resolved to the other.
    const baseUrl = await ensureApiBaseUrl();
    const encoded = encodeURIComponent(appRedirect);
    const handoff = handoffId
      ? `&handoff=${encodeURIComponent(handoffId)}`
      : '';
    return `${baseUrl}/auth/google/authorize?app_redirect=${encoded}${handoff}`;
  },

  /**
   * Collects the session the OAuth callback parked under `handoffId`
   * (`POST /auth/google/claim`).
   *
   * Unauthenticated — the id is the credential — single use, and good for five
   * minutes. This, not the deep link, is how a Google session reaches the app:
   * a claim can be retried, a redirect that never arrives cannot.
   */
  claimGoogleSession(handoffId: string) {
    return request<{ session: Session }>('/auth/google/claim', {
      method: 'POST',
      body: { handoff_id: handoffId },
    });
  },

  // ── Profiles & providers ────────────────────────────────────────────────────
  /**
   * No latitude/longitude: the backend geocodes `address` + `city` and stores
   * the coordinates itself, and rejects them from the client with a 400
   * (backend/BACKEND_SCHEMA.md §32). An unverifiable address fails the save
   * with a message that can be shown as-is.
   */
  updateProfile(input: Partial<{
    full_name: string;
    phone: string;
    avatar_url: string;
    address: string;
    city: string;
  }>) {
    return authRequest<Profile>('/profiles/me', { method: 'PATCH', body: input });
  },

  /**
   * Deletes the signed-in account. Resolves on success (204, no body).
   *
   * Throws a 409 `ApiError` when the account still has obligations — a
   * balance, a pending withdrawal, escrow held, a live job, an open dispute.
   * Every blocker is listed at once rather than one per attempt; read them
   * with `deletionBlockersFrom(err)`.
   *
   * This is a soft delete server-side: the row is retained (jobs, reviews and
   * ledger entries still point at it) with identifying fields overwritten, and
   * the address freed for reuse. The caller must sign out afterwards — the
   * access token stays syntactically valid until it expires.
   */
  deleteAccount() {
    return authRequest<void>('/profiles/me', { method: 'DELETE' });
  },

  upsertProviderProfile(input: {
    category_id: number;
    bio: string;
    years_experience?: number;
    service_radius_km?: number;
  }) {
    return authRequest<ProviderProfile>('/profiles/me/provider', {
      method: 'PUT',
      body: input,
    });
  },

  setAvailability(is_available: boolean) {
    return authRequest<ProviderProfile>('/profiles/me/provider/availability', {
      method: 'PATCH',
      body: { is_available },
    });
  },

  getProvider(id: string) {
    return authRequest<ProviderCard>(`/providers/${id}`);
  },

  getProviderWork(id: string) {
    return authRequest<ProviderWorkItem[]>(`/providers/${id}/work`);
  },

  getProviderReviews(id: string) {
    return authRequest<unknown[]>(`/providers/${id}/reviews`);
  },

  categories() {
    return authRequest<Category[]>('/categories');
  },

  geocodeAddress(address: string) {
    return authRequest<{ latitude: number; longitude: number }>(
      `/jobs/geocode?address=${encodeURIComponent(address)}`,
    );
  },

  /**
   * Suggestions for a partially typed address (`GET /geocoding/autocomplete`).
   * The backend answers an empty list rather than an error when the geocoder
   * is unavailable, so the address field never blocks on it.
   */
  addressSuggestions(query: string) {
    return authRequest<AddressSuggestion[]>(
      `/geocoding/autocomplete?q=${encodeURIComponent(query)}`,
    );
  },

  /** The address at a GPS fix (`GET /geocoding/reverse`). */
  reverseGeocode(latitude: number, longitude: number) {
    return authRequest<GeocodedAddress>(
      `/geocoding/reverse?lat=${latitude}&lon=${longitude}`,
    );
  },

  /**
   * `<Image>` source for the job form's map preview (`GET /jobs/static-map`).
   * The backend renders it so the Geoapify key never ships in the app. The
   * image loader can't go through `authRequest`, so the token rides as a
   * header and a 401 is not refreshed — callers hide the image on error.
   */
  staticMapSource(latitude: number, longitude: number) {
    const token = getAccessToken();
    return {
      uri: `${activeBaseUrl}/jobs/static-map?lat=${latitude}&lon=${longitude}`,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    };
  },

  // ── Jobs ────────────────────────────────────────────────────────────────────
  createJob(input: {
    category_id: number;
    title: string;
    description: string;
    urgency?: 'urgent' | 'normal' | 'flexible';
    address: string;
    latitude: number;
    longitude: number;
    budget?: number;
    /**
     * Single ISO instant. The form collects a date and a time separately and
     * combines them here — two fields for one instant is timezone-ambiguous,
     * and the backend column is a `timestamptz`.
     */
    scheduled_at?: string;
    /** Storage paths from `uploadImage`, not device URIs. */
    photo_urls?: string[];
    /**
     * Checklist labels in display order (step 3 of the guided flow). Stored as
     * text server-side, so the suggestion catalogue can change without
     * rewriting jobs already posted.
     */
    tasks?: string[];
  }) {
    return authRequest<Job>('/jobs', { method: 'POST', body: input });
  },

  browseJobs(params: {
    category_id?: number;
    limit?: number;
    offset?: number;
    latitude?: number;
    longitude?: number;
    radius_km?: number;
  } = {}) {
    const q = new URLSearchParams();
    if (params.category_id != null) q.set('category_id', String(params.category_id));
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
    if (params.latitude != null) q.set('latitude', String(params.latitude));
    if (params.longitude != null) q.set('longitude', String(params.longitude));
    if (params.radius_km != null) q.set('radius_km', String(params.radius_km));
    const qs = q.toString();
    return authRequest<{
      jobs: Job[];
      summary: { open_count: number; urgent_count: number; potential_payout: number };
    }>(`/jobs${qs ? `?${qs}` : ''}`);
  },

  myJobs() {
    return authRequest<Job[]>('/jobs/mine');
  },

  assignedJobs() {
    return authRequest<Job[]>('/jobs/assigned');
  },

  getJob(id: string) {
    return authRequest<Job>(`/jobs/${id}`);
  },

  cancelJob(id: string) {
    return authRequest<Job>(`/jobs/${id}/cancel`, { method: 'POST' });
  },

  /**
   * Provider accepts an incoming booking request: the job moves from
   * 'assigned' (hired, awaiting their answer) to 'confirmed', and the
   * homeowner is notified. The mirror of `declineJob`.
   */
  /** `location`: where the provider is as they accept (migration 0034). */
  acceptJob(id: string, location?: { address: string; latitude: number; longitude: number }) {
    return authRequest<Job>(`/jobs/${id}/accept`, { method: 'POST', body: location ?? {} });
  },

  startJob(id: string) {
    return authRequest<Job>(`/jobs/${id}/start`, { method: 'POST' });
  },

  /** Assigned provider ticks a checklist item off. Returns the updated job. */
  updateJobTask(jobId: string, taskId: string, is_done: boolean) {
    return authRequest<Job>(`/jobs/${jobId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: { is_done },
    });
  },

  declineJob(id: string, reason: string) {
    return authRequest<Job>(`/jobs/${id}/decline`, {
      method: 'POST',
      body: { reason },
    });
  },

  completeJob(id: string) {
    return authRequest<Job>(`/jobs/${id}/complete`, { method: 'POST' });
  },

  triggerRecommendations(jobId: string) {
    return authRequest<RecommendationTriggerResult>(
      `/jobs/${jobId}/recommendations/trigger`,
      { method: 'POST' },
    );
  },

  // ── Applications ──────────────────────────────────────────────────────────────
  applyToJob(jobId: string, cover_message?: string) {
    return authRequest<unknown>(`/jobs/${jobId}/applications`, {
      method: 'POST',
      body: { cover_message },
    });
  },

  jobApplications(jobId: string) {
    return authRequest<JobApplication[]>(`/jobs/${jobId}/applications`);
  },

  myApplications() {
    return authRequest<unknown[]>('/applications/mine');
  },

  acceptApplication(id: string) {
    return authRequest<unknown>(`/applications/${id}/accept`, { method: 'POST' });
  },

  rejectApplication(id: string) {
    return authRequest<unknown>(`/applications/${id}/reject`, { method: 'POST' });
  },

  withdrawApplication(id: string) {
    return authRequest<unknown>(`/applications/${id}/withdraw`, { method: 'POST' });
  },

  // ── Reviews ─────────────────────────────────────────────────────────────────
  reviewJob(jobId: string, input: { rating: number; comment?: string }) {
    return authRequest<unknown>(`/jobs/${jobId}/review`, {
      method: 'POST',
      body: input,
    });
  },

  // ── Notifications ─────────────────────────────────────────────────────────────
  notifications(unreadOnly = false) {
    return authRequest<unknown[]>(
      `/notifications${unreadOnly ? '?unread=true' : ''}`,
    );
  },

  markNotificationRead(id: string) {
    return authRequest<unknown>(`/notifications/${id}/read`, { method: 'POST' });
  },

  markAllNotificationsRead() {
    return authRequest<{ success: boolean }>('/notifications/read-all', {
      method: 'POST',
    });
  },

  deleteNotification(id: string) {
    return authRequest<void>(`/notifications/${id}`, { method: 'DELETE' });
  },

  clearNotifications() {
    return authRequest<void>('/notifications', { method: 'DELETE' });
  },

  /** Server-side count — `notifications()` is capped at 50, so counting it caps the badge. */
  unreadNotificationCount() {
    return authRequest<{ count: number }>('/notifications/unread-count');
  },

  // ── Uploads ───────────────────────────────────────────────────────────────
  /**
   * Two steps: ask the API for a signed URL, then PUT the bytes straight to
   * Supabase Storage. The file never passes through the API. Returns the
   * storage *path*, which is what job/verification payloads carry.
   */
  async uploadImage(
    bucket: 'job-photos' | 'verification-docs' | 'avatars' | 'chat-attachments',
    uri: string,
  ): Promise<string> {
    const contentType = contentTypeFor(uri);
    const signed = await authRequest<SignedUpload>('/uploads/signed-url', {
      method: 'POST',
      body: { bucket, content_type: contentType },
    });

    // Send the file as a typed multipart part, as supabase-js does. A Blob from
    // fetch(file://) usually has an empty type, which React Native uploads as
    // application/octet-stream regardless of the header, and Storage records
    // that as the object's mimetype.
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', {
      uri,
      name: signed.path.split('/').pop() ?? 'upload',
      type: contentType,
    } as unknown as Blob);
    const res = await fetch(signed.upload_url, { method: 'PUT', body: form });
    if (!res.ok) {
      throw new ApiError('Could not upload the image. Try again.', res.status);
    }
    return signed.path;
  },

  // ── Service change requests (migration 0034) ──────────────────────────────
  mySkillRequests() {
    return authRequest<SkillRequest[]>('/skill-requests/me');
  },

  createSkillRequest(input: { type: SkillRequestType; category_id: number; reason: string }) {
    return authRequest<SkillRequest>('/skill-requests', { method: 'POST', body: input });
  },

  cancelSkillRequest(id: string) {
    return authRequest<SkillRequest>(`/skill-requests/${id}/cancel`, { method: 'POST' });
  },

  // ── Verifications ─────────────────────────────────────────────────────────
  submitVerification(input: {
    id_document_path: string;
    selfie_path: string;
    document_type?: string;
  }) {
    return authRequest<Verification>('/verifications', {
      method: 'POST',
      body: input,
    });
  },

  /**
   * Opens a Stripe Identity check — the automated third step of the
   * verification flow. The ID and selfie already uploaded travel with it, so
   * an admin can still finish the review by hand if Stripe never returns a
   * verdict. The decision arrives by webhook, so the screen polls
   * `myVerification()` afterwards rather than reading a result here.
   */
  startIdentitySession(input: {
    id_document_path?: string;
    selfie_path?: string;
    document_type?: string;
  } = {}) {
    return authRequest<IdentitySession>('/verifications/identity-session', {
      method: 'POST',
      body: input,
    });
  },

  myVerification() {
    return authRequest<Verification | null>('/verifications/me');
  },

  // ── Disputes ──────────────────────────────────────────────────────────────
  raiseDispute(jobId: string, input: { reason: string; details?: string }) {
    return authRequest<Dispute>(`/jobs/${jobId}/disputes`, {
      method: 'POST',
      body: input,
    });
  },

  jobDispute(jobId: string) {
    return authRequest<Dispute | null>(`/jobs/${jobId}/disputes`);
  },

  // ── Wallet ──────────────────────────────────────────────────────────────────
  wallet() {
    return authRequest<WalletOverview>('/wallet');
  },

  /**
   * Files a withdrawal request.
   *
   * The row comes back `pending`: the money has not moved and will not until
   * an admin settles it from the console. There is no payout rail — settlement
   * is a human sending money and recording the reference — so `destination` is
   * free text a person reads, not a validated account identifier.
   *
   * Checked against the wallet's `available`, not `balance`, so two requests
   * cannot both draw on the same funds.
   */
  requestWithdrawal(input: {
    amount: number;
    destination: string;
    title?: string;
  }) {
    return authRequest<WalletTransaction>('/wallet/withdrawals', {
      method: 'POST',
      body: input,
    });
  },

  /** The caller's own withdrawal requests, newest first. */
  withdrawals() {
    return authRequest<WalletTransaction[]>('/wallet/withdrawals');
  },

  /** Withdraws a request that has not been settled yet, returning the funds. */
  cancelWithdrawal(id: string) {
    return authRequest<WalletTransaction>(`/wallet/withdrawals/${id}/cancel`, {
      method: 'POST',
    });
  },

  /**
   * @deprecated Superseded by `requestWithdrawal`. The backend keeps this route
   * working but now files the same pending request rather than writing a
   * completed debit.
   */
  createWalletTransaction(input: {
    direction: 'debit';
    amount: number;
    title: string;
    job_id?: string;
  }) {
    return authRequest<WalletTransaction>('/wallet/transactions', {
      method: 'POST',
      body: input,
    });
  },

  /**
   * Starts a wallet top-up and returns Stripe's hosted Checkout URL for the
   * app to open in a browser.
   *
   * Checkout rather than the native PaymentSheet because the app runs in Expo
   * Go, which cannot load native modules. Same reasoning as the Google flow:
   * the browser does the work and comes back through `app_redirect`.
   *
   * The returned URL funds nothing on its own — the wallet is credited when
   * Stripe's webhook reaches the backend, which may land a moment after the
   * browser closes.
   */
  createCheckoutSession(input: { amount: number; app_redirect: string }) {
    return authRequest<CheckoutSession>('/payments/checkout-session', {
      method: 'POST',
      body: input,
    });
  },

  /**
   * Card-at-hire: a hosted Checkout for the job's full budget. Open `url`
   * with `openAuthSessionAsync`; the browser comes back to `app_redirect`
   * with `?hire=success|cancelled`. **Nothing is hired by this call or by the
   * redirect** — Stripe's webhook credits the payment, holds it and accepts
   * the application, so poll `jobApplications` for `accepted` afterwards.
   */
  createHireCheckoutSession(input: { application_id: string; app_redirect: string }) {
    return authRequest<CheckoutSession>('/payments/hire-checkout-session', {
      method: 'POST',
      body: input,
    });
  },

  // ── Stripe Connect payouts (providers) ─────────────────────────────────────
  connectStatus() {
    return authRequest<ConnectStatus>('/payments/connect');
  },

  /**
   * A single-use Stripe onboarding URL. Open it with `openAuthSessionAsync`;
   * the backend bounces the browser back to `app_redirect` with
   * `?connect=return` (left the form — finished or not, so call
   * `connectSync`) or `?connect=refresh` (the link expired; ask for another).
   */
  connectOnboardingLink(input: { app_redirect: string }) {
    return authRequest<{ url: string; expires_at: number }>(
      '/payments/connect/onboarding-link',
      { method: 'POST', body: input },
    );
  },

  /** Re-reads the payout account from Stripe. */
  connectSync() {
    return authRequest<ConnectStatus>('/payments/connect/sync', { method: 'POST' });
  },

  /** A one-time link into the provider's Stripe Express dashboard. */
  connectDashboardLink() {
    return authRequest<{ url: string }>('/payments/connect/dashboard-link', {
      method: 'POST',
    });
  },

  // ── Chat ────────────────────────────────────────────────────────────────────
  conversations() {
    return authRequest<Conversation[]>('/conversations');
  },

  openConversation(job_id: string) {
    return authRequest<Conversation>('/conversations', {
      method: 'POST',
      body: { job_id },
    });
  },

  messages(conversationId: string) {
    return authRequest<Message[]>(`/conversations/${conversationId}/messages`);
  },

  sendMessage(conversationId: string, body: string, attachmentPath?: string) {
    return authRequest<Message>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body, attachment_path: attachmentPath },
    });
  },

  markConversationRead(conversationId: string) {
    return authRequest<{ success: boolean }>(
      `/conversations/${conversationId}/read`,
      { method: 'POST' },
    );
  },

  /**
   * Opens the authenticated live-message stream. EventSource setup is deferred
   * until the API base URL has resolved, and cleanup remains safe in that gap.
   */
  streamMessages(
    conversationId: string,
    since: string | undefined,
    onMessage: (message: Message) => void,
  ) {
    let source: EventSource<'ping'> | null = null;
    let closed = false;

    void ensureApiBaseUrl()
      .then((baseUrl) => {
        const token = getAccessToken();
        if (closed || !token) return;

        const cursor = since ? `?since=${encodeURIComponent(since)}` : '';
        source = new EventSource(`${baseUrl}/conversations/${conversationId}/stream${cursor}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        source.addEventListener('message', (event) => {
          if (!event.data) return;
          try {
            onMessage(JSON.parse(event.data) as Message);
          } catch {
            // A malformed event must not disrupt the open chat screen.
          }
        });
      })
      .catch(() => {
        // Streaming is an enhancement; the loaded conversation remains usable.
      });

    return () => {
      closed = true;
      source?.close();
    };
  },

  // ── Devices / push notifications ──────────────────────────────────────────
  registerDevice(input: { token: string; platform: 'ios' | 'android' | 'web' }) {
    return authRequest<{ success: boolean }>('/devices', {
      method: 'POST',
      body: input,
    });
  },

  unregisterDevice(accessToken: string, token: string) {
    return request<{ success: boolean }>(`/devices/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      accessToken,
    });
  },

  // ── Calendar ────────────────────────────────────────────────────────────────
  bookings(params: { from?: string; to?: string } = {}) {
    const q = new URLSearchParams();
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    const qs = q.toString();
    return authRequest<Booking[]>(`/calendar/bookings${qs ? `?${qs}` : ''}`);
  },

  createBooking(input: {
    job_id: string;
    scheduled_at: string;
    duration_minutes?: number;
    notes?: string;
  }) {
    return authRequest<Booking>('/calendar/bookings', {
      method: 'POST',
      body: input,
    });
  },

  updateBooking(
    id: string,
    input: Partial<{
      scheduled_at: string;
      duration_minutes: number;
      status: 'scheduled' | 'completed' | 'cancelled';
      notes: string;
    }>,
  ) {
    return authRequest<Booking>(`/calendar/bookings/${id}`, {
      method: 'PATCH',
      body: input,
    });
  },
};

export { PRIMARY_API_URL, FALLBACK_API_URL };
