// ─── Session storage ──────────────────────────────────────────────────────────
// Persists the admin's auth session (backend access token + profile) across
// page reloads. Mirrors the localStorage pattern AppContext already uses for
// UI preferences (see PREFS_KEY in context/AppContext.tsx).

export interface StoredSession {
  accessToken: string;
  /** Kept so an expired access token can be renewed instead of forcing a logout. */
  refreshToken?: string;
  adminProfile: { name: string; email: string };
}

const SESSION_KEY = "tb-admin-session";

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null; // corrupted storage — behave as if signed out
  }
}

export function setStoredSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
