import { create } from 'zustand';
import { refreshSession, type SupabaseSession } from '../api/auth';
import type { AssistantProfile, AssistantClassPerm } from '../api/assistantAuth';
import { storage } from '../storage';
import { saveSession, loadSession, clearSession } from '../auth/sessionStorage';

// Refresh the access token a little before it actually expires, so a flush that
// fires right on the boundary doesn't 401.
const REFRESH_SKEW_SECONDS = 120;

const KEYS = {
  SESSION: 'assistant_session',
  PROFILE: 'assistant_profile',
  PERMS: 'assistant_permissions',
} as const;

interface AssistantState {
  status: 'loading' | 'unauthenticated' | 'authenticated';
  session: SupabaseSession | null;
  profile: AssistantProfile | null;
  permissions: AssistantClassPerm[];

  hydrate: () => Promise<void>;
  setAuth: (session: SupabaseSession, profile: AssistantProfile, permissions: AssistantClassPerm[]) => Promise<void>;
  setPermissions: (permissions: AssistantClassPerm[]) => Promise<void>;
  clearAuth: () => Promise<void>;
  /**
   * Return a valid access token for the Reconcile phase, refreshing first if the
   * current one is at/near expiry. Best-effort: if the refresh can't reach the
   * server (still offline) it returns the existing token so callers can try the
   * flush anyway. Returns null only when there's no session to refresh from.
   */
  ensureFreshToken: () => Promise<string | null>;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  status: 'loading',
  session: null,
  profile: null,
  permissions: [],

  hydrate: async () => {
    try {
      const [session, profileRaw, permsRaw] = await Promise.all([
        loadSession(KEYS.SESSION),
        storage.getItem(KEYS.PROFILE),
        storage.getItem(KEYS.PERMS),
      ]);
      const profile = profileRaw ? (JSON.parse(profileRaw) as AssistantProfile) : null;
      const permissions = permsRaw ? (JSON.parse(permsRaw) as AssistantClassPerm[]) : [];
      const isExpired = session ? session.expires_at * 1000 < Date.now() : true;

      if (session && !isExpired && profile) {
        set({ status: 'authenticated', session, profile, permissions });
      } else {
        set({ status: 'unauthenticated', session: null, profile: null, permissions: [] });
      }
    } catch {
      set({ status: 'unauthenticated', session: null, profile: null, permissions: [] });
    }
  },

  setAuth: async (session, profile, permissions) => {
    await Promise.all([
      saveSession(KEYS.SESSION, session),
      storage.setItem(KEYS.PROFILE, JSON.stringify(profile)),
      storage.setItem(KEYS.PERMS, JSON.stringify(permissions)),
    ]);
    set({ status: 'authenticated', session, profile, permissions });
  },

  setPermissions: async (permissions) => {
    await storage.setItem(KEYS.PERMS, JSON.stringify(permissions));
    set({ permissions });
  },

  clearAuth: async () => {
    await Promise.all([
      clearSession(KEYS.SESSION),
      storage.deleteItem(KEYS.PROFILE),
      storage.deleteItem(KEYS.PERMS),
    ]);
    set({ status: 'unauthenticated', session: null, profile: null, permissions: [] });
  },

  ensureFreshToken: async () => {
    const session = get().session;
    if (!session) return null;

    const expiresInSec = session.expires_at - Math.floor(Date.now() / 1000);
    if (expiresInSec > REFRESH_SKEW_SECONDS) return session.access_token;

    try {
      const next = await refreshSession(session.refresh_token);
      await saveSession(KEYS.SESSION, next);
      set({ session: next });
      return next.access_token;
    } catch {
      // Refresh failed. If the token is genuinely expired we can't use it; but
      // if it's only within the skew window it's still valid, so hand it back
      // and let the flush attempt proceed (it may still be online enough).
      return expiresInSec > 0 ? session.access_token : null;
    }
  },
}));
