/**
 * useSettings.ts — the signed-in user's preference toggles.
 *
 * Both Settings screens held these as plain `useState`, so every switch reset
 * itself on the next mount. They are a real, stored row (`user_settings`,
 * migration 0011) behind GET/PATCH /settings; this hook is the one place that
 * knows that.
 *
 * Writes are optimistic. A preference switch has to move the instant it is
 * touched — waiting on a round trip (a cold Render dyno is 30–60s) would read
 * as a broken control — so the flag flips locally first and rolls back if the
 * PATCH fails. Only the changed field is sent; every field is optional
 * server-side.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api, type UserSettings } from '../lib/api';

/** The writable half of the row — the timestamps and key are server-owned. */
export type SettingsFlags = Omit<
  UserSettings,
  'profile_id' | 'created_at' | 'updated_at'
>;

/**
 * Mirrors the DDL defaults in migration 0011. Used only to render switches
 * before the first fetch lands; the server's row replaces them on arrival.
 */
const DEFAULTS: SettingsFlags = {
  push_enabled: true,
  email_enabled: true,
  sms_enabled: false,
  location_sharing: true,
  dark_mode: false,
};

export function useSettings() {
  const { setDark } = useTheme();
  const { profile } = useAuth();
  const profileId = profile?.id;
  const account = useRef(profileId);
  account.current = profileId;
  const [flags, setFlags] = useState<SettingsFlags>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    saving.current = false;
    setIsSaving(false);
    setFlags(DEFAULTS);
    setLoading(true);
    setLoaded(false);
    setError(null);
    api
      .settings()
      .then((s) => {
        if (active) { setFlags(s); setDark(s.dark_mode); setLoaded(true); }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Could not load your settings.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [profileId, attempt, setDark]);

  const setFlag = useCallback(
    async <K extends keyof SettingsFlags>(key: K, value: SettingsFlags[K]) => {
      if (saving.current) {
        setError('Please wait for the current settings change to finish.');
        return;
      }
      saving.current = true;
      setIsSaving(true);
      const requestedAccount = profileId;
      const previous = flags[key];
      if (key === 'dark_mode') setDark(value as boolean);
      setFlags((current) => ({ ...current, [key]: value }));
      setError(null);
      try {
        const saved = await api.updateSettings({ [key]: value });
        // Trust the server's row over the optimistic guess.
        if (mounted.current && account.current === requestedAccount) setFlags(saved);
        if (mounted.current && account.current === requestedAccount && key === 'dark_mode') setDark(saved.dark_mode);
      } catch (e: unknown) {
        if (mounted.current && account.current === requestedAccount && key === 'dark_mode') setDark(previous as boolean);
        if (mounted.current && account.current === requestedAccount) {
          setFlags((current) => ({ ...current, [key]: previous }));
          setError(e instanceof Error ? e.message : 'Could not save that change.');
        }
      } finally {
        if (mounted.current && account.current === requestedAccount) {
          saving.current = false;
          setIsSaving(false);
        }
      }
    },
    [flags, setDark, profileId],
  );

  return { flags, setFlag, loading: loading || isSaving || !loaded, error, reload: () => setAttempt(value => value + 1) };
}
