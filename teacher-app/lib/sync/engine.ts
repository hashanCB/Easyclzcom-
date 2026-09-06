import { AppState, AppStateStatus, Platform } from 'react-native';
import { create } from 'zustand';
import { pushAll } from './push';
import { pullAll } from './pull';
import { SessionExpiredError } from './client';
import { useAuthStore } from '../auth/store';
import { useSubscriptionStore, isPro } from '../subscription/store';
import { newId } from '../uuid';
import {
  getLastCloudBackupAt,
  recordCloudBackupDone,
  isCloudBackupDue,
} from '../backup/cloud';

/** Refresh proactively when less than this much time remains on the token. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Backstop auto-sync while in foreground (5 minutes). The primary trigger is
 * now event-driven (see scheduleSync below); this timer just catches anything a
 * change-event somehow missed (clock edges, a write path that forgot to notify).
 */
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Debounce window between a local edit and the background backup it triggers.
 * Event-driven, not polled: every user write calls scheduleSync(), and we wait
 * this long for the burst to settle before one batched sync — so marking 30
 * students absent uploads once, ~2.5s after the last mark, not 30 times. This
 * is what makes the manual "back up now" tap unnecessary when online.
 */
const SYNC_DEBOUNCE_MS = 2500;

/**
 * Retry backoff after a failed save. We start fast (30s) so a brief network
 * blip recovers quickly, then double each attempt (1m, 2m, 4m, 8m) and cap at
 * 10 minutes so a long outage doesn't drain the battery or hammer the server.
 */
const RETRY_BASE_MS = 30 * 1000;
const RETRY_MAX_MS = 10 * 60 * 1000;

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  /**
   * ISO timestamp of the last successful cloud backup (full push), persisted to
   * SecureStore so it survives app restarts. `lastSyncedAt` is in-memory only;
   * this is the durable "Backed up X ago" source of truth.
   */
  lastCloudBackupAt: string | null;
  errorMsg: string | null;
  /** Trigger a full push → pull cycle. No-op while already syncing. */
  sync: () => Promise<void>;
  /** Load the persisted last-cloud-backup timestamp for the current teacher. */
  hydrateCloudBackup: () => Promise<void>;
  /** Reset error state back to idle. */
  clearError: () => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  lastSyncedAt: null,
  lastCloudBackupAt: null,
  errorMsg: null,

  hydrateCloudBackup: async () => {
    const teacher = useAuthStore.getState().teacher;
    if (!teacher) return;
    try {
      const at = await getLastCloudBackupAt(teacher.id);
      if (at) set({ lastCloudBackupAt: at });
    } catch {
      /* best-effort — indicator just stays empty */
    }
  },

  sync: async () => {
    if (get().status === 'syncing') return;

    const authStore = useAuthStore.getState();
    let { session, teacher } = authStore;
    if (!session || !teacher) return;

    // Token already fully expired — try refresh once before giving up.
    const tokenExpiresMs = session.expires_at * 1000;
    const needsRefresh = tokenExpiresMs < Date.now() + REFRESH_BUFFER_MS;
    if (needsRefresh) {
      const refreshed = await authStore.tryRefreshSession();
      if (!refreshed) {
        // Refresh failed — token is gone; force logout with expiry prompt.
        await useAuthStore.getState().expireSession();
        return;
      }
      // Re-read the now-updated session from the store.
      session = useAuthStore.getState().session!;
    }

    // Pro gate: the Free plan is local-only — it never uploads to the cloud.
    // Fetch the plan once if we don't know it yet, so we don't wrongly block a
    // Pro user before their subscription has loaded.
    const subStore = useSubscriptionStore.getState();
    if (!subStore.subscription) {
      await subStore.fetch(session.access_token);
    }
    if (!isPro(useSubscriptionStore.getState().subscription)) {
      set({ status: 'idle', errorMsg: null });
      useSubscriptionStore.getState().maybeShowAd();
      return;
    }

    set({ status: 'syncing', errorMsg: null });

    try {
      const teacherId = teacher.id;
      const token = session.access_token;

      // Push local changes first, then pull remote changes.
      const counts = await pushAll(teacherId, token);
      await pullAll(teacherId, token);

      const now = new Date().toISOString();
      // A successful push IS a cloud backup — persist the timestamp so the
      // "Backed up X ago" indicator survives restarts and the daily scheduler
      // knows when the last backup happened.
      set({ status: 'done', lastSyncedAt: now, lastCloudBackupAt: now, errorMsg: null });
      void recordCloudBackupDone(teacherId, now);

      // Write success entry to local sync log (best-effort — never throws)
      try {
        const { syncLogRepo } = require('../../db/repositories/syncLogRepo') as
          typeof import('../../db/repositories/syncLogRepo');
        syncLogRepo.insert({
          id: newId(),
          syncedAt: now,
          status: 'success',
          errorMessage: null,
          classesPushed:    counts.classes,
          studentsPushed:   counts.students,
          paymentsPushed:   counts.payments,
          attendancePushed: counts.attendance,
          notesPushed:      counts.notes,
          examsPushed:      counts.exams,
          marksPushed:      counts.marks,
        });
      } catch { /* log failure must never break sync */ }

    } catch (e: unknown) {
      // 401/403 mid-sync — session expired while the request was in flight.
      if (e instanceof SessionExpiredError) {
        set({ status: 'idle', errorMsg: null });
        await useAuthStore.getState().expireSession();
        return;
      }
      const msg = (e as Error).message;
      set({ status: 'error', errorMsg: msg });

      // Write error entry to local sync log (best-effort)
      try {
        const { syncLogRepo } = require('../../db/repositories/syncLogRepo') as
          typeof import('../../db/repositories/syncLogRepo');
        syncLogRepo.insert({
          id: newId(),
          syncedAt: new Date().toISOString(),
          status: 'error',
          errorMessage: msg,
          classesPushed: 0, studentsPushed: 0, paymentsPushed: 0,
          attendancePushed: 0, notesPushed: 0, examsPushed: 0, marksPushed: 0,
        });
      } catch { /* ignore */ }
    }
  },

  clearError: () => set({ status: 'idle', errorMsg: null }),
}));

// ─── Event-driven backup trigger ────────────────────────────────────────────
//
// The real-world pattern: instead of polling, a backup is *triggered by the
// change itself*, debounced so a burst of edits coalesces into one batched
// upload. Idle apps do zero work; online edits reach the cloud in ~2.5s.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function runDebounced(): void {
  debounceTimer = null;
  const st = useSyncStore.getState().status;
  // A sync is already in flight — re-arm so edits made during it aren't missed.
  if (st === 'syncing') { scheduleSync(); return; }
  // Offline: the exponential backoff retry owns recovery. Don't compete with it;
  // the next edit (or a reconnect) will re-trigger. Avoids a busy 2.5s loop.
  if (st === 'error') return;
  void useSyncStore.getState().sync();
}

/**
 * Ask for a cloud backup soon. Call after any local write (the user-action
 * mutation functions do this). Cheap and safe to call repeatedly — it only
 * resets a short timer, and the underlying sync() is idempotent. No-op on web.
 */
export function scheduleSync(): void {
  if (Platform.OS === 'web') return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runDebounced, SYNC_DEBOUNCE_MS);
}

/** Convenience hook — returns only what components need. */
export function useSyncEngine() {
  const status     = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const lastCloudBackupAt = useSyncStore((s) => s.lastCloudBackupAt);
  const errorMsg   = useSyncStore((s) => s.errorMsg);
  const sync       = useSyncStore((s) => s.sync);
  const clearError = useSyncStore((s) => s.clearError);
  return { status, lastSyncedAt, lastCloudBackupAt, errorMsg, sync, clearError };
}

/**
 * Start automatic background sync. Call once when the teacher is authenticated.
 *
 * Triggers:
 *  1. App comes back to the foreground (inactive/background → active).
 *  2. Every AUTO_SYNC_INTERVAL_MS (5 min) while in foreground.
 *  3. After a failed save: exponential backoff retry (30s → 10m cap, jittered)
 *     so a network blip recovers fast without draining battery on a long outage.
 *
 * The underlying sync() is already idempotent (no-op while syncing, no-op
 * when session is missing), so calling it frequently is always safe.
 *
 * Returns a cleanup function — call it on logout / unmount.
 */
export function startAutoSync(): () => void {
  // Web doesn't have AppState events; bail gracefully.
  if (Platform.OS === 'web') return () => {};

  const doSync = () => void useSyncStore.getState().sync();

  // --- Failure backoff: retry sooner than the 5-min timer, then ease off ----
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = () => {
    clearRetry();
    // Exponential: 30s, 1m, 2m, 4m, 8m … capped at 10m.
    const base = Math.min(RETRY_BASE_MS * 2 ** retryAttempt, RETRY_MAX_MS);
    // ±25% jitter so thousands of phones don't retry in lockstep (thundering herd).
    const jitter = base * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.max(5_000, Math.round(base + jitter));
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      doSync();
    }, delay);
  };

  // React to sync outcome: back off on failure, reset the moment one succeeds.
  const unsubscribe = useSyncStore.subscribe((state, prev) => {
    if (state.status === prev.status) return;
    if (state.status === 'error') {
      scheduleRetry();
    } else if (state.status === 'done') {
      retryAttempt = 0;
      clearRetry();
    }
  });

  // Load the persisted last-backup timestamp, then guarantee a daily cloud
  // backup: if more than a day has passed (or there's never been one), run a
  // sync immediately on open. Best-effort — never blocks startup.
  const ensureDailyBackup = () => {
    void (async () => {
      try {
        await useSyncStore.getState().hydrateCloudBackup();
        const teacher = useAuthStore.getState().teacher;
        if (teacher && (await isCloudBackupDue(teacher.id))) {
          doSync();
        }
      } catch {
        /* ignore — the 5-min timer will still attempt syncs */
      }
    })();
  };

  ensureDailyBackup();

  // --- AppState: sync when app returns to foreground ----------------------
  let currentState: AppStateStatus = AppState.currentState;
  const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    const wasBackground = currentState === 'background' || currentState === 'inactive';
    const nowActive = nextState === 'active';
    if (wasBackground && nowActive) {
      doSync();
      // Resuming after a long time away may also cross the daily boundary.
      ensureDailyBackup();
    }
    currentState = nextState;
  });

  // --- Backstop timer: every 5 minutes while foreground ------------------
  // Edits back themselves up via scheduleSync(); this only catches anything a
  // change-event missed.
  const timer = setInterval(doSync, AUTO_SYNC_INTERVAL_MS);

  return () => {
    appStateSub.remove();
    clearInterval(timer);
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    clearRetry();
    unsubscribe();
  };
}

/** Human-readable time-ago string for the sync strip. */
export function timeSinceSync(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'Never synced';
  const diffMs = Date.now() - new Date(lastSyncedAt).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
