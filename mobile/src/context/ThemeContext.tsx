import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

import { lightPalette, darkPalette, type Palette } from '../constants/palettes';
export { lightPalette, darkPalette, type Palette } from '../constants/palettes';
const STORAGE_KEY = 'taskbuddy:dark-mode';
const ThemeContext = createContext({
  palette: lightPalette, dark: false, error: null as string | null,
  setDark: (_dark: boolean): void => { throw new Error('ThemeProvider is required to change appearance.'); },
});

/** Device appearance also applies to signed-out screens. Server settings are
 * authoritative after sign-in; stale reads cannot overwrite a newer toggle. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const [dark, setDarkState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const revision = useRef(0);
  const storageWrites = useRef(Promise.resolve());
  const setDark = useCallback((value: boolean) => {
    revision.current += 1;
    setDarkState(value);
    setError(null);
  }, []);
  useEffect(() => {
    let active = true;
    const requestedRevision = revision.current;
    AsyncStorage.getItem(STORAGE_KEY).then(value => {
      if (value !== null && value !== 'true' && value !== 'false') throw new Error('Invalid saved appearance preference.');
      if (active) {
        if (revision.current === requestedRevision) setDarkState(value === 'true');
        setRestored(true);
      }
    }).catch((e: Error) => { if (active) { setError(e.message); setRestored(true); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!restored || !profileId) return;
    let active = true;
    const requestedRevision = revision.current;
    api.settings().then(settings => {
      if (active && revision.current === requestedRevision) { setDarkState(settings.dark_mode); setError(null); }
    }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [profileId, restored]);
  useEffect(() => {
    if (!restored || error) return;
    storageWrites.current = storageWrites.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, String(dark)))
      .catch((e: Error) => setError(e.message));
  }, [dark, restored, error]);
  const value = useMemo(() => ({ palette: dark ? darkPalette : lightPalette, dark, error, setDark }), [dark, error, setDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);

/** Each screen keeps its own style factory; only palette selection is shared. */
export function useThemedStyles<T>(factory: (palette: Palette) => T): T {
  const { palette } = useTheme();
  return useMemo(() => factory(palette), [factory, palette]);
}
