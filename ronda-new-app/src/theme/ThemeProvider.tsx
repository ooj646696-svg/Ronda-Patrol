import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colorsByTheme, ThemeColors, ThemeMode, ThemeName } from './colors';

type ThemeContextValue = {
  mode: ThemeMode;
  theme: ThemeName;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const STORAGE_KEY = '@ronda_theme_mode';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeScheme(scheme: ColorSchemeName): ThemeName {
  return scheme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ThemeName>(normalizeScheme(Appearance.getColorScheme()));

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(normalizeScheme(colorScheme));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      } catch {
        // ignore
      }
    };

    load();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const theme: ThemeName = mode === 'system' ? systemScheme : mode;

  const colors = useMemo(() => colorsByTheme[theme], [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      theme,
      colors,
      setMode,
    }),
    [mode, theme, colors, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
