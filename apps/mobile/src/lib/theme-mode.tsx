import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { storage } from './storage';

/** The customer's choice: follow the phone (`system`), or always light or dark. */
export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

const KEY = 'mcmart.theme';

/** Tells React Native which scheme to use app-wide; every `useColorScheme()` follows it. */
function apply(mode: ThemeMode) {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

const ThemeModeContext = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void }>({ mode: 'system', setMode: () => {} });

/** Light or dark mode, chosen in Profile and kept on the phone (the website follows the browser). */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  useEffect(() => {
    void storage.get(KEY).then((v) => {
      if (v === 'light' || v === 'dark') {
        setModeState(v);
        apply(v);
      }
    });
  }, []);
  const setMode = (m: ThemeMode) => {
    setModeState(m);
    apply(m);
    void storage.set(KEY, m === 'system' ? null : m);
  };
  return <ThemeModeContext value={{ mode, setMode }}>{children}</ThemeModeContext>;
}

export const useThemeMode = () => useContext(ThemeModeContext);
