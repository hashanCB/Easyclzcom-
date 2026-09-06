import { useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAuthStore } from '../lib/auth/store';
import { useAssistantStore } from '../lib/assistant/store';
import { useThemeStore } from '../lib/theme/store';
import { useNotificationStore } from '../lib/notifications/store';
import { useSubscriptionStore, hasActiveAccess, trialDaysLeft } from '../lib/subscription/store';
import { shouldShowTrialReminderToday, markTrialReminderShown } from '../lib/subscription/trialReminder';
import {
  configureForegroundHandler,
  registerPushToken,
  addNotificationResponseListener,
} from '../lib/push';
import { startAutoSync } from '../lib/sync/engine';
import { startAnalytics } from '../lib/analytics';
import { isBackupOverdue } from '../lib/backup/reminder';
import { isDeviceSessionActive } from '../lib/auth/deviceFence';
import { getDeviceId } from '../lib/device';
import { logger } from '../lib/logger';

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const teacherStatus = useAuthStore((s) => s.status);
  const assistantStatus = useAssistantStore((s) => s.status);

  useEffect(() => {
    // Wait for both stores to finish hydrating
    if (teacherStatus === 'loading' || assistantStatus === 'loading') return;

    const inAuth = segments[0] === '(auth)';
    const inAssistant = segments[0] === '(assistant)';

    // Assistant authenticated → go to assistant screens
    if (assistantStatus === 'authenticated') {
      if (!inAssistant) router.replace('/(assistant)');
      return;
    }

    // Teacher authenticated → go to teacher app
    if (teacherStatus === 'authenticated') {
      if (inAuth || inAssistant) router.replace('/(app)');
      return;
    }

    // Nobody authenticated → go to login. Login is the universal entry point:
    // it handles same-device sign-in AND new-device auto-evict (§5.8). A
    // genuinely-never-activated account is routed to the token screen from
    // there. (isActivated is no longer used for routing.) Redirect from
    // anywhere outside the (auth) group — including the initial empty route —
    // so a fresh install never lands on the token screen by default.
    if (!inAuth) {
      router.replace('/(auth)/login');
    }
  }, [teacherStatus, assistantStatus, segments, router]);

  return null;
}

// U45 — register this device's Expo push token once authenticated, configure the
// foreground banner, and route chat-notification taps to the thread.
function PushManager() {
  const router = useRouter();
  const teacherStatus = useAuthStore((s) => s.status);
  const teacherSession = useAuthStore((s) => s.session);
  const assistantStatus = useAssistantStore((s) => s.status);
  const assistantSession = useAssistantStore((s) => s.session);

  useEffect(() => { configureForegroundHandler(); }, []);

  useEffect(() => {
    if (teacherStatus === 'authenticated' && teacherSession?.access_token) {
      void registerPushToken('teacher', teacherSession.access_token);
    }
  }, [teacherStatus, teacherSession?.access_token]);

  useEffect(() => {
    if (assistantStatus === 'authenticated' && assistantSession?.access_token) {
      void registerPushToken('assistant', assistantSession.access_token);
    }
  }, [assistantStatus, assistantSession?.access_token]);

  useEffect(() => {
    const unsub = addNotificationResponseListener((data) => {
      // Chat → thread, join request → requests inbox, everything else → notification center.
      if (data.type === 'chat' && typeof data.thread_id === 'string') {
        router.push({ pathname: '/(app)/chat/[id]', params: { id: data.thread_id } });
      } else if (data.type === 'join_request') {
        router.push('/(app)/students/requests');
      } else {
        router.push('/(app)/notifications');
      }
    });
    return unsub;
  }, [router]);

  return null;
}

/**
 * NotificationsManager — keeps the in-app notification feed (bell badge + list)
 * fresh for the signed-in teacher. Fetches on auth, when the app returns to the
 * foreground, and on a light interval; clears the store on logout. No UI.
 */
function NotificationsManager() {
  const teacherStatus = useAuthStore((s) => s.status);
  const token = useAuthStore((s) => s.session?.access_token);

  useEffect(() => {
    if (teacherStatus !== 'authenticated' || !token) {
      useNotificationStore.getState().clear();
      return;
    }

    const fetchNotifs = () => void useNotificationStore.getState().fetch(token);
    fetchNotifs(); // on auth / mount

    const timer = setInterval(fetchNotifs, 60 * 1000);

    let currentState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = currentState === 'background' || currentState === 'inactive';
      if (wasBackground && nextState === 'active') fetchNotifs();
      currentState = nextState;
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [teacherStatus, token]);

  return null;
}

/**
 * TrialReminderManager — every teacher gets a 14-day trial on signup and must
 * pay afterwards (no free tier). While the trial is running, this nudges the
 * teacher once per calendar day to choose a plan, so the trial ending is never a
 * surprise. Checks on auth/subscription load and each time the app returns to
 * the foreground. Silent outside the trial (active plan, or trial already
 * expired — the paywall handles that case).
 */
function TrialReminderManager() {
  const router = useRouter();
  const teacherStatus = useAuthStore((s) => s.status);
  const teacherId = useAuthStore((s) => s.teacher?.id);
  const subscription = useSubscriptionStore((s) => s.subscription);
  const inFlightRef = useRef(false);

  function check() {
    if (teacherStatus !== 'authenticated' || !teacherId || !subscription) return;
    // Only during a live trial. Expired trials fall through to the paywall.
    if (subscription.status !== 'trialing' || !hasActiveAccess(subscription)) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    void (async () => {
      try {
        if (!(await shouldShowTrialReminderToday(teacherId))) return;
        await markTrialReminderShown(teacherId);
        const days = trialDaysLeft(subscription);
        const left =
          days <= 0 ? 'Your free trial ends today.'
          : days === 1 ? 'You have 1 day left in your free trial.'
          : `You have ${days} days left in your free trial.`;
        Alert.alert(
          'Free trial',
          `${left}\n\nChoose a plan now to keep using Easyclz without interruption when the trial ends.`,
          [
            { text: 'Later', style: 'cancel' },
            { text: 'View plans', onPress: () => router.push('/(app)/subscription') },
          ],
        );
      } finally {
        inFlightRef.current = false;
      }
    })();
  }

  // Check on auth / subscription load.
  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherStatus, teacherId, subscription]);

  // Check again on foreground (covers crossing midnight with the app open).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let currentState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = currentState === 'background' || currentState === 'inactive';
      if (wasBackground && nextState === 'active') check();
      currentState = nextState;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherStatus, teacherId, subscription]);

  return null;
}

/**
 * SessionExpiredManager — watches for forced logouts caused by token expiry
 * and shows an Alert so the teacher knows why they were returned to login.
 */
function SessionExpiredManager() {
  const sessionExpiredAt = useAuthStore((s) => s.sessionExpiredAt);
  const logoutReason = useAuthStore((s) => s.logoutReason);
  const clearSessionExpired = useAuthStore((s) => s.clearSessionExpired);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionExpiredAt || shownRef.current === sessionExpiredAt) return;
    shownRef.current = sessionExpiredAt;
    const [title, message] =
      logoutReason === 'superseded'
        ? [
            'Signed Out',
            'Your account was signed in on another phone, so this device was signed out. ' +
              'Log in again here to switch back.',
          ]
        : ['Session Expired', 'Your session has expired. Please log in again to continue.'];
    Alert.alert(title, message, [{ text: 'OK', onPress: clearSessionExpired }]);
  }, [sessionExpiredAt, logoutReason, clearSessionExpired]);

  return null;
}

/**
 * DeviceFenceManager — enforces newest-device-wins. When the teacher signs in on
 * another phone, login_teacher marks this device's session inactive. This watcher
 * (on mount, on foreground, and every 2 min) notices and logs this phone out with
 * a "used on another device" message. Fail-open: network blips never log out.
 */
function DeviceFenceManager() {
  const teacherStatus = useAuthStore((s) => s.status);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (teacherStatus !== 'authenticated') return;

    let cancelled = false;

    async function check() {
      const { session, teacher, status } = useAuthStore.getState();
      if (status !== 'authenticated' || !session?.access_token || !teacher) return;
      try {
        const deviceId = await getDeviceId();
        const active = await isDeviceSessionActive(teacher.id, deviceId, session.access_token);
        if (!cancelled && !active) {
          await useAuthStore.getState().expireSession('superseded');
        }
      } catch {
        // fail-open
      }
    }

    void check(); // on mount

    const timer = setInterval(() => void check(), 2 * 60 * 1000);

    let currentState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = currentState === 'background' || currentState === 'inactive';
      if (wasBackground && nextState === 'active') void check();
      currentState = nextState;
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [teacherStatus]);

  return null;
}

/**
 * BackupReminderManager — shows an alert once per app session when the teacher
 * has not backed up in the last 7 days (or never). Checks on mount and each
 * time the app returns to the foreground.
 */
function BackupReminderManager() {
  const router = useRouter();
  const teacherStatus = useAuthStore((s) => s.status);
  const shownThisSession = useRef(false);

  function check() {
    if (teacherStatus !== 'authenticated') return;
    if (shownThisSession.current) return;
    void isBackupOverdue().then((overdue) => {
      if (!overdue) return;
      if (shownThisSession.current) return;
      shownThisSession.current = true;
      Alert.alert(
        'Backup Reminder',
        'You have not backed up your data in the last 7 days. Back up now to avoid losing your records.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Back Up Now',
            onPress: () => router.push('/(app)/backup'),
          },
        ],
      );
    });
  }

  // Check on mount / auth change
  useEffect(() => {
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherStatus]);

  // Check again each time app returns to foreground
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let currentState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = currentState === 'background' || currentState === 'inactive';
      if (wasBackground && nextState === 'active') check();
      currentState = nextState;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherStatus]);

  return null;
}

/**
 * SyncManager — mounts at app root and wires up automatic background sync.
 * Starts when the teacher is authenticated; stops cleanly on logout.
 * No UI — purely a lifecycle hook.
 */
function SyncManager() {
  const teacherStatus = useAuthStore((s) => s.status);

  useEffect(() => {
    if (teacherStatus !== 'authenticated') return;
    // startAutoSync returns a cleanup fn — React calls it on re-run / unmount.
    return startAutoSync();
  }, [teacherStatus]);

  return null;
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateAssistant = useAssistantStore((s) => s.hydrate);
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    hydrateAssistant();
    hydrateTheme();
    startAnalytics(); // begin batched, offline-friendly event flushing
    if (Platform.OS !== 'web') {
      try {
        const { runMigrations } = require('../db/migrate') as typeof import('../db/migrate');
        runMigrations().catch((e: unknown) => logger.warn('migrations failed', e));
      } catch (e) {
        logger.warn('migrations setup failed', e);
      }
    }
  }, [hydrate, hydrateAssistant, hydrateTheme]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <ErrorBoundary>
        <AuthGuard />
        <PushManager />
        <NotificationsManager />
        <TrialReminderManager />
        <SyncManager />
        <SessionExpiredManager />
        <DeviceFenceManager />
        <BackupReminderManager />
        <Slot />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
