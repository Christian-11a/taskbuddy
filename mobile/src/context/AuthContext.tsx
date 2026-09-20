/**
 * AuthContext.tsx — real authentication state backed by the NestJS API.
 *
 * Replaces the old DEMO-mode navigation (which picked a role without auth).
 * Holds the Supabase session tokens (persisted with AsyncStorage so the user
 * stays logged in across app restarts) plus the resolved profile, and exposes
 * signIn / signUp / signOut / signInWithGoogle for the auth screens to call.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import {
  api,
  ApiError,
  configureApiAuth,
  toBackendRole,
  toMobileRole,
  type MobileRole,
  type Profile,
  type ProviderProfile,
  type Session,
} from '../lib/api';
import { requestExpoPushRegistration } from '../lib/pushNotifications';
import { openRedirectSession } from '../lib/appRedirectSession';

// Required for expo-auth-session to complete the OAuth flow on Android
WebBrowser.maybeCompleteAuthSession();

// Google OAuth is driven entirely by the backend (see signInWithGoogle below),
// so the app holds no client ID or secret of its own.

const SESSION_KEY = 'taskbuddy.session';

/**
 * A Google sign-in waiting to be claimed: `{ id, startedAt }`. On disk rather
 * than in state because the redirect can restart the app (a development build
 * reloads its bundle when its own scheme is opened), and everything in memory
 * goes with it.
 */
const PENDING_SIGNIN_KEY = 'taskbuddy.pendingGoogleSignIn';

/** Matches the backend's handoff row TTL — past it a claim can only fail. */
const PENDING_SIGNIN_TTL_MS = 5 * 60 * 1000;

const CLAIM_ATTEMPTS = 5;
const CLAIM_RETRY_MS = 2000;

const PROFILE_ATTEMPTS = 3;
const PROFILE_RETRY_MS = 1500;

/**
 * True when the API has actually rejected these tokens, rather than failing to
 * answer about them. Only the first justifies throwing a session away.
 */
function isRejectedSession(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true; // e.g. corrupt JSON on disk
  return err.status === 401 || err.status === 403;
}

/**
 * `/auth/me`, retried through the failures that say nothing about the session:
 * no connection (status 0), a 5xx from a sleeping host, and the brief 401 a
 * brand-new Google user gets while their profile row is still being created by
 * the `handle_new_user` trigger.
 */
async function fetchProfileWithRetry(accessToken: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < PROFILE_ATTEMPTS; attempt++) {
    try {
      return await api.me(accessToken);
    } catch (e) {
      lastError = e;
      const status = e instanceof ApiError ? e.status : null;
      const worthRetrying =
        status === 0 || status === null || status >= 500 || status === 401;
      if (!worthRetrying || attempt === PROFILE_ATTEMPTS - 1) throw e;
      await new Promise((r) => setTimeout(r, PROFILE_RETRY_MS));
    }
  }
  throw lastError;
}

interface AuthContextValue {
  /** True until the persisted session (if any) has been restored on launch. */
  initializing: boolean;
  session: Session | null;
  profile: Profile | null;
  providerProfile: ProviderProfile | null;
  role: MobileRole | null;
  isAuthenticated: boolean;
  /**
   * True when the authenticated provider has been verified by an admin.
   * Always false for homeowners and unauthenticated users.
   */
  isVerified: boolean;
  /**
   * True when the signed-in user came via Google OAuth and hasn't yet picked
   * their role on GoogleRoleSelectionScreen.
   */
  isGoogleSignupPending: boolean;
  /**
   * A sign-in failure worth showing, kept in context rather than in the screen
   * because the failure can outlive the screen: a Google sign-in that resumes
   * on launch has no LoginScreen to report to.
   */
  authError: string | null;
  clearAuthError: () => void;
  /** Re-fetch /auth/me (e.g. after editing the profile). */
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /** Returns whether email confirmation is still required before login works. */
  signUp: (input: {
    email: string;
    password: string;
    fullName: string;
    role: MobileRole;
    phone?: string;
    categoryId?: number;
    consentedTerms?: boolean;
    consentedPrivacy?: boolean;
    consentedDataCollection?: boolean;
    consentedBiometric?: boolean;
  }) => Promise<{ needsEmailConfirmation: boolean }>;
  /** Initiates the Google OAuth browser flow and signs the user in on success. */
  signInWithGoogle: () => Promise<void>;
  /**
   * Completes a password reset with the emailed code and signs the user in
   * with the session the backend returns.
   */
  resetPassword: (input: {
    email: string;
    token: string;
    newPassword: string;
  }) => Promise<void>;
  /**
   * Confirms a newly registered address with the emailed 6-digit code and
   * signs the user in with the session the backend returns.
   */
  verifyEmailOtp: (input: { email: string; token: string }) => Promise<void>;
  /**
   * Completes the profile for a new Google OAuth user after role selection.
   * Clears the google_signup_pending flag and refreshes the local profile.
   */
  completeGoogleProfile: (input: {
    role: MobileRole;
    categoryId?: number;
    consentedTerms?: boolean;
    consentedPrivacy?: boolean;
    consentedDataCollection?: boolean;
    consentedBiometric?: boolean;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [providerProfile, setProviderProfile] =
    useState<ProviderProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Always-current token, read by the api client's auth accessor.
  const sessionRef = useRef<Session | null>(null);
  const pushTokenRef = useRef<string | null>(null);

  const persistSession = useCallback(async (next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } else {
      await AsyncStorage.removeItem(SESSION_KEY);
    }
  }, []);

  // Wire the api client so authenticated calls attach the token and can
  // refresh + retry once on a 401 — screens never handle tokens themselves.
  useEffect(() => {
    configureApiAuth(
      () => sessionRef.current?.access_token ?? null,
      async () => {
        const current = sessionRef.current;
        if (!current) return null;
        try {
          const { session: refreshed } = await api.refresh(
            current.refresh_token,
          );
          await persistSession(refreshed);
          return refreshed.access_token;
        } catch (err) {
          // Only a *rejected* refresh token means the session is over. A
          // network failure or a 5xx from a sleeping host is temporary, and
          // signing the user out there threw away a session that was fine —
          // the screen that got the 401 shows its own error instead.
          if (!isRejectedSession(err)) return null;
          await persistSession(null);
          setProfile(null);
          setProviderProfile(null);
          return null;
        }
      },
    );
  }, [persistSession]);

  // Permission prompts and registration are deliberately best-effort: neither
  // should block an authenticated session when a device cannot receive pushes.
  // Best-effort still means *reported*, though — a swallowed error here made a
  // missing EAS projectId (which never fixes itself) indistinguishable from a
  // user declining the prompt, so push silently never worked for anyone.
  useEffect(() => {
    if (!session || !profile) return;
    let active = true;

    void (async () => {
      const outcome = await requestExpoPushRegistration();
      if (!active) return;

      if (outcome.status !== 'registered') {
        if (__DEV__ && outcome.status !== 'denied') {
          const detail = 'reason' in outcome ? ` — ${outcome.reason}` : '';
          console.warn(`[push] not registered (${outcome.status})${detail}`);
        }
        return;
      }

      pushTokenRef.current = outcome.registration.token;
      try {
        await api.registerDevice(outcome.registration);
      } catch (e) {
        // The token is still held so sign-out can attempt to unregister it.
        if (__DEV__) console.warn('[push] POST /devices failed', e);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile?.id, session?.access_token]);

  /**
   * Adopts a session the API just handed us.
   *
   * **The session is persisted before the profile is fetched**, which is the
   * whole point of the ordering. `/auth/me` can fail transiently — a sleeping
   * Render instance, a 502 from something in between, or the 401 the guard
   * returns in the moment before the new user's profile row is visible — and
   * the old order threw one-time tokens away on any of those. Stored tokens
   * are recoverable: the next launch retries the profile with them.
   */
  const adoptSession = useCallback(
    async (next: Session): Promise<void> => {
      await persistSession(next);
      const me = await fetchProfileWithRetry(next.access_token);
      setProfile(me.profile);
      setProviderProfile(me.provider_profile);
    },
    [persistSession],
  );

  /**
   * Trades a handoff id for the session the OAuth callback parked (§19).
   *
   * Retried, because this runs exactly when the backend is least likely to
   * answer first time: the browser hop may have been the first request in
   * minutes and Render may still be waking. A claim that reports the id is
   * unknown is final — it was already used, or it expired — so it stops.
   */
  const claimPendingSignIn = useCallback(
    async (handoffId: string): Promise<boolean> => {
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        try {
          const { session: claimed } = await api.claimGoogleSession(handoffId);
          await AsyncStorage.removeItem(PENDING_SIGNIN_KEY);
          await adoptSession(claimed);
          if (__DEV__) console.log('[auth] claimed google session');
          return true;
        } catch (e) {
          const status = e instanceof ApiError ? e.status : null;
          // 404/410: nothing parked under this id, and nothing ever will be.
          if (status === 404 || status === 410) {
            await AsyncStorage.removeItem(PENDING_SIGNIN_KEY);
            return false;
          }
          if (attempt === CLAIM_ATTEMPTS - 1) throw e;
          await new Promise((r) => setTimeout(r, CLAIM_RETRY_MS));
        }
      }
      return false;
    },
    [adoptSession],
  );

  /**
   * Finishes a sign-in left pending by a browser round trip, if one is.
   *
   * Called on launch as well as when the Google flow returns, because the
   * redirect can *restart* the app — a development build reloads its bundle on
   * its own scheme — and whatever was awaiting the browser is gone by then.
   * The pending id lives in AsyncStorage precisely so it survives that.
   */
  const resumePendingSignIn = useCallback(async (): Promise<boolean> => {
    const raw = await AsyncStorage.getItem(PENDING_SIGNIN_KEY);
    if (!raw) return false;

    let pending: { id: string; startedAt: number };
    try {
      pending = JSON.parse(raw) as { id: string; startedAt: number };
    } catch {
      await AsyncStorage.removeItem(PENDING_SIGNIN_KEY);
      return false;
    }

    // Matches the backend's row TTL — past it the claim can only 404.
    if (Date.now() - pending.startedAt > PENDING_SIGNIN_TTL_MS) {
      await AsyncStorage.removeItem(PENDING_SIGNIN_KEY);
      return false;
    }

    return claimPendingSignIn(pending.id);
  }, [claimPendingSignIn]);

  // ── Restore a persisted session on launch ────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // A launch that *is* the tail of a Google sign-in: the browser came
        // back, the app restarted, and the session is still waiting to be
        // claimed. Checked first so a fresh sign-in wins over a stale session.
        try {
          if ((await resumePendingSignIn()) && mounted) return;
        } catch (e) {
          if (mounted) {
            setAuthError(
              e instanceof Error
                ? e.message
                : 'Could not finish signing you in. Please try again.',
            );
          }
        }

        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as Session;
        // Validate the token by fetching the profile; refresh once if expired.
        let active: Session = stored;
        try {
          const me = await fetchProfileWithRetry(active.access_token);
          if (mounted) {
            sessionRef.current = active;
            setSession(active);
            setProfile(me.profile);
            setProviderProfile(me.provider_profile);
          }
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            const { session: refreshed } = await api.refresh(
              active.refresh_token,
            );
            active = refreshed;
            const me = await fetchProfileWithRetry(active.access_token);
            if (mounted) {
              await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(active));
              sessionRef.current = active;
              setSession(active);
              setProfile(me.profile);
              setProviderProfile(me.provider_profile);
            }
          } else {
            throw err;
          }
        }
      } catch (err) {
        // Only a *rejected* session is discarded. A network failure or a 5xx
        // from a sleeping host says nothing about whether these tokens are
        // still good, and deleting them there logged people out every time the
        // API was slow to wake.
        if (isRejectedSession(err)) {
          await AsyncStorage.removeItem(SESSION_KEY);
        } else if (__DEV__) {
          console.warn('[auth] session kept despite a failed restore', err);
        }
      } finally {
        if (mounted) setInitializing(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { session: next } = await api.login({
        email: email.trim(),
        password,
      });
      const me = await api.me(next.access_token);
      await persistSession(next);
      setProfile(me.profile);
      setProviderProfile(me.provider_profile);
    },
    [persistSession],
  );

  /**
   * Step 2 of the reset. The backend verifies the emailed code, rotates the
   * password, and hands back a session — so this ends signed in, rather than
   * returning to Login to retype a password set seconds ago.
   */
  const resetPassword = useCallback(
    async (input: { email: string; token: string; newPassword: string }) => {
      const { session: next } = await api.resetPassword({
        email: input.email.trim(),
        token: input.token.trim(),
        new_password: input.newPassword,
      });
      const me = await api.me(next.access_token);
      await persistSession(next);
      setProfile(me.profile);
      setProviderProfile(me.provider_profile);
    },
    [persistSession],
  );

  /**
   * Confirms a new account with the emailed code and signs the user in.
   *
   * Same shape as resetPassword, and for the same reason: the code proves they
   * hold the mailbox, so the backend hands back a live session rather than
   * making them retype the password they entered a minute ago.
   */
  const verifyEmailOtp = useCallback(
    async (input: { email: string; token: string }) => {
      const { session: next } = await api.verifyEmailOtp({
        email: input.email.trim(),
        token: input.token.trim(),
      });
      const me = await api.me(next.access_token);
      await persistSession(next);
      setProfile(me.profile);
      setProviderProfile(me.provider_profile);
    },
    [persistSession],
  );

  const refreshProfile = useCallback(async () => {
    const token = sessionRef.current?.access_token;
    if (!token) return;
    const me = await api.me(token);
    setProfile(me.profile);
    setProviderProfile(me.provider_profile);
  }, []);

  const signUp = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      role: MobileRole;
      phone?: string;
      categoryId?: number;
      consentedTerms?: boolean;
      consentedPrivacy?: boolean;
      consentedDataCollection?: boolean;
      consentedBiometric?: boolean;
    }) => {
      // Step 1 — Register the core fields only.
      // Consent + category fields are sent in a follow-up call (step 2) once we
      // have a JWT, because the current Render deployment doesn't accept them on
      // POST /auth/register yet (forbidNonWhitelisted). This will be collapsed
      // back into a single call once Render deploys the updated backend.
      const res = await api.register({
        email: input.email.trim(),
        password: input.password,
        role: toBackendRole(input.role),
        full_name: input.fullName.trim(),
        phone: input.phone?.trim() || undefined,
      });

      // If the project has email confirmation disabled, register returns a
      // session and we can log the user straight in.
      if (res.session) {
        const me = await api.me(res.session.access_token);
        await persistSession(res.session);
        setProfile(me.profile);
        setProviderProfile(me.provider_profile);

        // Step 2 — Persist consents + category now that we have a JWT.
        // Uses the complete-google-profile endpoint which accepts these fields
        // and is guarded by JWT. Fire-and-forget; failure is non-fatal for the
        // user (they can still log in; consents will be re-prompted if needed).
        if (
          input.consentedTerms ||
          input.consentedPrivacy ||
          input.consentedDataCollection ||
          input.consentedBiometric ||
          input.categoryId
        ) {
          api.completeGoogleProfile(res.session.access_token, {
            role: toBackendRole(input.role),
            category_id: input.categoryId,
            consented_terms: input.consentedTerms,
            consented_privacy: input.consentedPrivacy,
            consented_data_collection: input.consentedDataCollection,
            consented_biometric: input.consentedBiometric,
          }).catch(() => {/* best-effort; non-fatal */});
        }

        return { needsEmailConfirmation: false };
      }
      return { needsEmailConfirmation: true };
    },
    [persistSession],
  );


  // ── Google OAuth (server-side flow) ────────────────────────────────────────
  //
  // Flow:
  //   1. App mints a handoff id, saves it to disk, and opens the backend
  //      /auth/google/authorize URL (carrying that id) in a browser.
  //   2. Backend redirects to Google (HTTPS callback — Google accepts it).
  //   3. Google redirects to the backend callback, which exchanges the code
  //      for an id_token, calls Supabase signInWithIdToken, and *parks* the
  //      session under sha256(handoff id) before sending the browser back to
  //      the app with only the id.
  //   4. The app claims the session over HTTPS, retrying until it succeeds.
  //
  // Step 4 is why sign-in is no longer at the mercy of the redirect. The deep
  // link now only decides *when* the app notices it should claim — and if it
  // never arrives, or it restarts the app, the pending id on disk is picked up
  // on the next launch and the sign-in still completes. Tokens never travel in
  // a URL, so they are also out of browser history.
  //
  // Google never sees the app deep-link — only the backend HTTPS callback —
  // so exp:// and taskbuddy:// both work without any Google Console changes.
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);

    const handoffId = Crypto.randomUUID();
    await AsyncStorage.setItem(
      PENDING_SIGNIN_KEY,
      JSON.stringify({ id: handoffId, startedAt: Date.now() }),
    );

    // appRedirect is exp://[ip]:8081 in Expo Go, taskbuddy:// in a real build.
    const appRedirect = AuthSession.makeRedirectUri({ scheme: 'taskbuddy' });
    const authorizeUrl = await api.getGoogleAuthorizeUrl(
      appRedirect,
      handoffId,
    );

    if (__DEV__) console.log('[auth] google redirect uri', appRedirect);

    const result = await openRedirectSession(authorizeUrl, appRedirect);

    if (__DEV__) console.log('[auth] google result', result.type);

    // An error from the backend rides the link even when the session does not.
    if (result.type === 'success') {
      const googleError = new URLSearchParams(
        result.url.split('?')[1] ?? '',
      ).get('google_error');
      if (googleError) {
        await AsyncStorage.removeItem(PENDING_SIGNIN_KEY);
        throw new Error(googleError);
      }
    }

    // Claim whatever the browser's own outcome was. 'dismiss' is what Android
    // reports when the custom tab closes because the deep link fired, so
    // treating it as a cancellation is exactly the bug this replaces — only a
    // claim that finds nothing parked means the user really did back out.
    if (await claimPendingSignIn(handoffId)) return;

    if (result.type === 'cancel' || result.type === 'dismiss') return;
    throw new Error('Google sign-in was unsuccessful. Please try again.');
  }, [claimPendingSignIn]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const signOut = useCallback(async () => {
    const token = session?.access_token;
    const pushToken = pushTokenRef.current;
    setProfile(null);
    setProviderProfile(null);
    await persistSession(null);
    pushTokenRef.current = null;
    if (token && pushToken) {
      // Do not let an unavailable push endpoint delay or prevent sign-out.
      api.unregisterDevice(token, pushToken).catch(() => {});
    }
    if (token) {
      // Best-effort server-side revocation; ignore failures.
      api.logout(token).catch(() => {});
    }
  }, [persistSession, session]);

  /**
   * Called after role selection for a new Google OAuth user. Calls the backend
   * to set the real role + consent timestamps, then refreshes /auth/me so the
   * local profile reflects the cleared google_signup_pending flag and any new
   * role-based routing kicks in immediately.
   */
  const completeGoogleProfile = useCallback(
    async (input: {
      role: MobileRole;
      categoryId?: number;
      consentedTerms?: boolean;
      consentedPrivacy?: boolean;
      consentedDataCollection?: boolean;
      consentedBiometric?: boolean;
    }) => {
      if (!session) throw new Error('Not authenticated');
      await api.completeGoogleProfile(session.access_token, {
        role: toBackendRole(input.role),
        category_id: input.categoryId,
        consented_terms: input.consentedTerms,
        consented_privacy: input.consentedPrivacy,
        consented_data_collection: input.consentedDataCollection,
        consented_biometric: input.consentedBiometric,
      });
      // Refresh the profile so the gate clears without requiring a re-login.
      await refreshProfile();
    },
    [session, refreshProfile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      session,
      profile,
      providerProfile,
      role: profile ? toMobileRole(profile.role) : null,
      isAuthenticated: !!session && !!profile,
      isVerified: !!(providerProfile?.is_verified),
      isGoogleSignupPending: !!(profile?.google_signup_pending),
      authError,
      clearAuthError,
      refreshProfile,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      verifyEmailOtp,
      completeGoogleProfile,
      signOut,
    }),
    [
      initializing,
      session,
      profile,
      providerProfile,
      authError,
      clearAuthError,
      refreshProfile,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      verifyEmailOtp,
      completeGoogleProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
