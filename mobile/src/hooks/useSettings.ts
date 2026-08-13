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
  const [flags, setFlags] = useState<SettingsFlags>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    api
      .settings()
      .then((s) => {
        if (mounted.current) setFlags(s);
      })
      .catch((e: unknown) => {
        // Falling back to defaults is deliberate: a failed read should leave
        // the switches usable, not frozen. A failed *write* is what the user
        // actually needs to hear about.
        if (mounted.current) {
          setError(e instanceof Error ? e.message : 'Could not load your settings.');
        }
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const setFlag = useCallback(
    async <K extends keyof SettingsFlags>(key: K, value: SettingsFlags[K]) => {
      const previous = flags[key];
      setFlags((current) => ({ ...current, [key]: value }));
      setError(null);
      try {
        const saved = await api.updateSettings({ [key]: value });
        // Trust the server's row over the optimistic guess.
        if (mounted.current) setFlags(saved);
      } catch (e: unknown) {
        if (mounted.current) {
          setFlags((current) => ({ ...current, [key]: previous }));
          setError(e instanceof Error ? e.message : 'Could not save that change.');
        }
      }
    },
    [flags],
  );

  return { flags, setFlag, loading, error };
}
