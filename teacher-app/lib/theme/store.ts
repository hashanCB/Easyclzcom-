import { create } from 'zustand';
import { SECURE_STORE } from '../constants';
import { storage } from '../storage';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  danger: string;
  overlay: string;
}

const light: ThemeColors = {
  bg: '#f0f2f5',
  surface: 'rgba(255,255,255,0.7)',
  surfaceAlt: 'rgba(255,255,255,0.9)',
  border: 'rgba(0,0,0,0.06)',
  text: '#0f172a',
  textMuted: '#64748b',
  primary: '#0f172a',
  primaryText: '#ffffff',
  danger: '#ef4444',
  overlay: 'rgba(15,23,42,0.4)',
};

const dark: ThemeColors = {
  bg: '#020617',
  surface: 'rgba(30,41,59,0.6)',
  surfaceAlt: 'rgba(30,41,59,0.8)',
  border: 'rgba(255,255,255,0.06)',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  primary: '#22c55e',
  primaryText: '#020617',
  danger: '#ef4444',
  overlay: 'rgba(2,6,23,0.6)',
};

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  hydrate: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggle: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'light',
  colors: light,
  hydrate: async () => {
    const saved = await storage.getItem(SECURE_STORE.THEME);
    if (saved === 'dark' || saved === 'light') {
      set({ mode: saved, colors: saved === 'dark' ? dark : light });
    }
  },
  setMode: async (mode) => {
    await storage.setItem(SECURE_STORE.THEME, mode);
    set({ mode, colors: mode === 'dark' ? dark : light });
  },
  toggle: async () => {
    const next = get().mode === 'dark' ? 'light' : 'dark';
    await get().setMode(next);
  },
}));
