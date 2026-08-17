export interface AdminProfile {
  id: string;
  name: string;
  email: string;
}

interface AdminSession {
  csrfToken: string;
  adminProfile: AdminProfile;
}

let session: AdminSession | null = null;
let csrfToken: string | null = null;

export function getAdminSession(): AdminSession | null {
  return session;
}

export function setAdminSession(nextSession: AdminSession): void {
  session = nextSession;
  csrfToken = nextSession.csrfToken;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(nextCsrfToken: string): void {
  csrfToken = nextCsrfToken;
  if (session) session = { ...session, csrfToken: nextCsrfToken };
}

export function clearAdminSession(): void {
  session = null;
  csrfToken = null;
}
