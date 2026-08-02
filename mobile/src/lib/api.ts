/**
 * api.ts — client for the TaskBuddy NestJS backend.
 *
 * Per the backend architecture, the mobile app talks ONLY to the NestJS API
 * (not to Supabase directly). NestJS wraps Supabase Auth + Postgres and returns
 * plain JSON. The base URL can be overridden with EXPO_PUBLIC_API_URL (set it to
 * your machine's LAN IP, e.g. http://192.168.1.20:3000, when running the backend
 * locally); otherwise it falls back to the deployed Render instance.
 *
 * Auth: AuthContext registers a token accessor + refresher via configureApiAuth().
 * Authenticated calls attach the bearer token automatically and retry once after
 * refreshing on a 401, so screens never handle tokens themselves.
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://taskbuddy-1d48.onrender.com';

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
  [key: string]: unknown;
}

export interface ProviderProfile {
  profile_id: string;
  category_id: number;
  bio: string;
  years_experience: number;
  is_available: boolean;
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
    | 'assigned'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'expired';
  address: string;
  latitude: number;
  longitude: number;
  posted_at: string;
  assigned_provider_id: string | null;
  /** Optional scheduling/pricing fields supplied by the mobile job form. */
  date?: string;
  time?: string;
  budget?: number;
  photo_uris?: string[];
  assigned_provider?: { full_name: string } | null;
  created_at: string;
  service_categories?: { name: string } | null;
  [key: string]: unknown;
}

export interface WalletTransaction {
  id: string;
  profile_id: string;
  direction: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'failed';
  amount: number;
  title: string;
  job_id: string | null;
  created_at: string;
}

export interface WalletOverview {
  balance: number;
  total_credited: number;
  total_debited: number;
  pending: number;
  transactions: WalletTransaction[];
}

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
  ) {
    super(message);
    this.name = 'ApiError';
  }
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

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
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
    throw new ApiError(message, response.status);
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
  }) {
    return request<RegisterResponse>('/auth/register', {
      method: 'POST',
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
    date: string;
    time: string;
    budget: number;
    photo_uris?: string[];
  }) {
    return authRequest<Job>('/jobs', { method: 'POST', body: input });
  },

  browseJobs(params: { category_id?: number; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams();
    if (params.category_id != null) q.set('category_id', String(params.category_id));
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
    const qs = q.toString();
    return authRequest<Job[]>(`/jobs${qs ? `?${qs}` : ''}`);
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

  startJob(id: string) {
    return authRequest<Job>(`/jobs/${id}/start`, { method: 'POST' });
  },

  completeJob(id: string) {
    return authRequest<Job>(`/jobs/${id}/complete`, { method: 'POST' });
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

  // ── Wallet ──────────────────────────────────────────────────────────────────
  wallet() {
    return authRequest<WalletOverview>('/wallet');
  },

  createWalletTransaction(input: {
    direction: 'credit' | 'debit';
    amount: number;
    title: string;
    job_id?: string;
  }) {
    return authRequest<WalletTransaction>('/wallet/transactions', {
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

export { API_BASE_URL };
