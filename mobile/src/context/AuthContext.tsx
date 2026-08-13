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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
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

// Required for expo-auth-session to complete the OAuth flow on Android
WebBrowser.maybeCompleteAuthSession();

// Google OAuth is driven entirely by the backend (see signInWithGoogle below),
// so the app holds no client ID or secret of its own.

const SESSION_KEY = 'taskbuddy.session';

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

  // Always-current token, read by the api client's auth accessor.
  const sessionRef = useRef<Session | null>(null);

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
        } catch {
          // Refresh failed — force sign-out state.
          await persistSession(null);
          setProfile(null);
          setProviderProfile(null);
          return null;
        }
      },
    );
  }, [persistSession]);

  // ── Restore a persisted session on launch ────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as Session;
        // Validate the token by fetching the profile; refresh once if expired.
        let active: Session = stored;
        try {
          const me = await api.me(active.access_token);
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
            const me = await api.me(active.access_token);
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
      } catch {
        // Corrupt/expired session — start signed out.
        await AsyncStorage.removeItem(SESSION_KEY);
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
  //   1. App opens the backend /auth/google/authorize URL in a browser.
  //   2. Backend redirects to Google (HTTPS callback — Google accepts it).
  //   3. Google redirects to the backend callback, which exchanges the code
  //      for an id_token, calls Supabase signInWithIdToken, then redirects
  //      the browser to appRedirect with session tokens in the query string.
  //   4. WebBrowser.openAuthSessionAsync intercepts the redirect back to the
  //      app scheme (exp:// in Expo Go, taskbuddy:// in builds) and resolves.
  //
  // Google never sees the app deep-link — only the backend HTTPS callback —
  // so exp:// and taskbuddy:// both work without any Google Console changes.
  const signInWithGoogle = useCallback(async () => {
    // appRedirect is exp://[ip]:8081 in Expo Go, taskbuddy:// in a real build.
    const appRedirect = AuthSession.makeRedirectUri({ scheme: 'taskbuddy' });
    const authorizeUrl = await api.getGoogleAuthorizeUrl(appRedirect);

    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl,
      appRedirect,
    );

    if (result.type !== 'success') {
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      throw new Error('Google sign-in was unsuccessful. Please try again.');
    }

    // Parse session tokens from the redirect URL query string.
    const query = result.url.split('?')[1] ?? '';
    const params = new URLSearchParams(query);

    const googleError = params.get('google_error');
    if (googleError) throw new Error(googleError);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresAt = params.get('expires_at');
    if (!accessToken || !refreshToken || !expiresAt) {
      throw new Error('Google sign-in did not return a valid session.');
    }

    const next: Session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Number(expiresAt),
    };

    const me = await api.me(next.access_token);
    await persistSession(next);
    setProfile(me.profile);
    setProviderProfile(me.provider_profile);
  }, [persistSession]);

  const signOut = useCallback(async () => {
    const token = session?.access_token;
    setProfile(null);
    setProviderProfile(null);
    await persistSession(null);
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
      refreshProfile,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      completeGoogleProfile,
      signOut,
    }),
    [
      initializing,
      session,
      profile,
      providerProfile,
      refreshProfile,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
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
