'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'comfort';

export const THEME_STORAGE_KEY = 'ams:theme_mode_v1';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (mode: ThemeMode) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  isDark: false,
  setTheme: () => {},
  cycleTheme: () => {},
});

export function applyThemeToDOM(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  if (mode === 'dark' || mode === 'comfort') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('light');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (saved === 'dark' || saved === 'comfort' || saved === 'light') {
        setThemeState(saved);
        applyThemeToDOM(saved);
      } else {
        applyThemeToDOM('light');
      }
    } catch (_e) {
      applyThemeToDOM('light');
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const next = e.newValue as ThemeMode;
        if (next === 'light' || next === 'dark' || next === 'comfort') {
          setThemeState(next);
          applyThemeToDOM(next);
        }
      }
    };

    const handleCustomThemeEvent = (e: Event) => {
      const custom = e as CustomEvent<ThemeMode>;
      if (custom.detail) {
        setThemeState(custom.detail);
        applyThemeToDOM(custom.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('ams:theme-changed', handleCustomThemeEvent);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('ams:theme-changed', handleCustomThemeEvent);
    };
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    applyThemeToDOM(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
      window.dispatchEvent(new CustomEvent('ams:theme-changed', { detail: mode }));
    } catch (_e) {}
  }, []);

  const cycleTheme = useCallback(() => {
    const next: ThemeMode =
      theme === 'light' ? 'dark' : theme === 'dark' ? 'comfort' : 'light';
    setTheme(next);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark' || theme === 'comfort',
        setTheme,
        cycleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
