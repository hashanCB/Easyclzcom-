import { create } from 'zustand';
import type { SupabaseSession, TeacherProfile } from '../api/auth';
import { refreshSession as refreshSessionApi } from '../api/auth';
import { SECURE_STORE } from '../constants';
import { storage } from '../storage';
import { saveSession, loadSession, clearSession } from './sessionStorage';

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  session: SupabaseSession | null;
  teacher: TeacherProfile | null;
  isActivated: boolean;
  /** Set when the session was forcibly cleared due to expiry (not manual logout). */
  sessionExpiredAt: string | null;
  /** Why the forced logout happened — drives the alert message. */
  logoutReason: 'expired' | 'superseded';

  hydrate: () => Promise<void>;
  setAuth: (session: SupabaseSession, teacher: TeacherProfile, activated?: boolean) => Promise<void>;
  clearAuth: () => Promise<void>;
  /** Try to silently refresh the access token. Returns true on success. */
  tryRefreshSession: () => Promise<boolean>;
  /**
   * Mark the session as forcibly ended (shows prompt) then clear auth.
   * `reason` is 'expired' (token gone) or 'superseded' (signed in on another phone).
   */
  expireSession: (reason?: 'expired' | 'superseded') => Promise<void>;
  clearSessionExpired: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  session: null,
  teacher: null,
  isActivated: false,
  sessionExpiredAt: null,
  logoutReason: 'expired',

  hydrate: async () => {
    try {
      const [session, teacherRaw, activatedRaw] = await Promise.all([
        loadSession(SECURE_STORE.SESSION),
        storage.getItem(SECURE_STORE.TEACHER),
        storage.getItem(SECURE_STORE.ACTIVATED),
      ]);

      const isActivated = activatedRaw === 'true';
      const teacher = teacherRaw ? (JSON.parse(teacherRaw) as TeacherProfile) : null;

      const isExpired = session ? session.expires_at * 1000 < Date.now() : true;

      if (session && !isExpired && teacher) {
        set({ status: 'authenticated', session, teacher, isActivated });
      } else {
        set({ status: 'unauthenticated', session: null, teacher: null, isActivated });
      }
    } catch {
      set({ status: 'unauthenticated', session: null, teacher: null, isActivated: false });
    }
  },

  setAuth: async (session, teacher, activated) => {
    await Promise.all([
      saveSession(SECURE_STORE.SESSION, session),
      storage.setItem(SECURE_STORE.TEACHER, JSON.stringify(teacher)),
      ...(activated ? [storage.setItem(SECURE_STORE.ACTIVATED, 'true')] : []),
    ]);
    set({
      status: 'authenticated',
      session,
      teacher,
      isActivated: activated ?? true,
    });
  },

  tryRefreshSession: async () => {
    const { session, teacher } = get();
    if (!session?.refresh_token || !teacher) return false;
    try {
      const newSession = await refreshSessionApi(session.refresh_token);
      await saveSession(SECURE_STORE.SESSION, newSession);
      set({ session: newSession });
      return true;
    } catch {
      return false;
    }
  },

  expireSession: async (reason = 'expired') => {
    const expiredAt = new Date().toISOString();
    // A token timeout (or being signed in on another phone) is NOT a device
    // handoff — it's the SAME teacher on the SAME phone, who will just log back
    // in. So we KEEP the local DB and the pull/backup flags: re-login is then
    // instant and does NOT trigger the new-phone restore prompt (which only
    // fires when the local DB is empty). Only a manual logout (clearAuth) wipes
    // local data, since that's the real "handing this device to someone" action.
    await Promise.all([
      clearSession(SECURE_STORE.SESSION),
      storage.deleteItem(SECURE_STORE.TEACHER),
      storage.deleteItem(SECURE_STORE.ACTIVATED),
    ]);
    set({ status: 'unauthenticated', session: null, teacher: null, isActivated: false, sessionExpiredAt: expiredAt, logoutReason: reason });
  },

  clearSessionExpired: () => set({ sessionExpiredAt: null }),

  clearAuth: async () => {
    // One account = one phone. Logging out is NOT erasing the device — the same
    // teacher will sign back in on this same phone. So we KEEP the local data
    // (and the pull/backup flags) and only clear the session tokens. Re-login is
    // then instant and does NOT show the new-phone "Welcome back" / restore
    // screen (that only fires when the local DB is empty — i.e. a real new
    // device). Data is already scoped per-teacher, so a different teacher signing
    // in here still can't see this teacher's rows.
    await Promise.all([
      clearSession(SECURE_STORE.SESSION),
      storage.deleteItem(SECURE_STORE.TEACHER),
      storage.deleteItem(SECURE_STORE.ACTIVATED),
    ]);
    set({ status: 'unauthenticated', session: null, teacher: null, isActivated: false });
  },
}));
