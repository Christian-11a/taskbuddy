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
  service_categories?: { name: string } | null;
  profiles?: { full_name: string; avatar_url: string | null; city: string | null } | null;
}

export interface Category {
  id: number;
  name: string;
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
  | 'recovery_credit';

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
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
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
  async getGoogleAuthorizeUrl(appRedirect: string): Promise<string> {
    // Async so sign-in cannot open the browser against one backend while the
    // rest of the app has resolved to the other.
    const baseUrl = await ensureApiBaseUrl();
    const encoded = encodeURIComponent(appRedirect);
    return `${baseUrl}/auth/google/authorize?app_redirect=${encoded}`;
  },

  // ── Profiles & providers ────────────────────────────────────────────────────
  updateProfile(input: Partial<{
    full_name: string;
    phone: string;
    avatar_url: string;
    address: string;
    city: string;
    latitude: number;
    longitude: number;
  }>) {
    return authRequest<Profile>('/profiles/me', { method: 'PATCH', body: input });
  },

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

  getProviderReviews(id: string) {
    return authRequest<unknown[]>(`/providers/${id}/reviews`);
  },

  categories() {
    return authRequest<Category[]>('/categories');
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
  acceptJob(id: string) {
    return authRequest<Job>(`/jobs/${id}/accept`, { method: 'POST' });
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
    return authRequest<unknown[]>(`/jobs/${jobId}/applications`);
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
    bucket: 'job-photos' | 'verification-docs' | 'avatars',
    uri: string,
  ): Promise<string> {
    const contentType = contentTypeFor(uri);
    const signed = await authRequest<SignedUpload>('/uploads/signed-url', {
      method: 'POST',
      body: { bucket, content_type: contentType },
    });

    // React Native turns a file:// URI into a Blob via fetch().
    const blob = await (await fetch(uri)).blob();
    const res = await fetch(signed.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    if (!res.ok) {
      throw new ApiError('Could not upload the image. Try again.', res.status);
    }
    return signed.path;
  },

  // ── Verifications ─────────────────────────────────────────────────────────
  submitVerification(input: {
    id_document_path: string;
    selfie_path: string;
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

  withdrawals() {
    return authRequest<WalletTransaction[]>('/wallet/withdrawals');
  },

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

  cancelWithdrawal(id: string) {
    return authRequest<WalletTransaction>(`/wallet/withdrawals/${id}/cancel`, {
      method: 'POST',
    });
  },

  /**
   * Withdrawals only. Credits are refused by the backend — wallet funding has
   * to come from a settled Stripe charge, so use `createCheckoutSession`.
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

  sendMessage(conversationId: string, body: string) {
    return authRequest<Message>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body },
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
