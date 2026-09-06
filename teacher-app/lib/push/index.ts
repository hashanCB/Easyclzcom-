// Expo push registration + handlers (U45).
// expo-notifications is lazy-required so the bundle/tsc work before the dep is
// installed and so web (where it's unavailable) degrades gracefully.
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { getDeviceId } from '../device';
import { logger } from '../logger';

// Minimal shape of the bits of expo-notifications we use. Declared locally so
// tsc passes before the dependency is installed (it's lazy-required at runtime).
interface NotificationResponse {
  notification: { request: { content: { data?: Record<string, unknown> } } };
}
interface NotificationsModule {
  setNotificationHandler(handler: unknown): void;
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  setNotificationChannelAsync(id: string, config: unknown): Promise<unknown>;
  getExpoPushTokenAsync(opts?: { projectId?: string }): Promise<{ data: string }>;
  addNotificationResponseReceivedListener(
    cb: (response: NotificationResponse) => void,
  ): { remove: () => void };
  AndroidImportance: { DEFAULT: number };
}

// expo-notifications remote push was removed from Expo Go in SDK 53.
// Bail out entirely when running in Expo Go so we don't crash on start-up.
// In a development build or production build it works fine.
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function getNotifications(): NotificationsModule | null {
  if (Platform.OS === 'web' || IS_EXPO_GO) return null;
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

// Foreground display behaviour — show the banner even when the app is open.
let handlerConfigured = false;
export function configureForegroundHandler(): void {
  if (handlerConfigured) return;
  const N = getNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      // SDK 54 fields (harmless on older):
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  handlerConfigured = true;
}

function easProjectId(): string | undefined {
  // Set once EAS is configured (app.json → expo.extra.eas.projectId).
  const extra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
  return extra.eas?.projectId
    ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

// Ask permission and return the Expo push token, or null on denial/error.
export async function getExpoPushToken(): Promise<string | null> {
  const N = getNotifications();
  if (!N) return null;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await N.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: N.AndroidImportance.DEFAULT,
      });
    }

    const projectId = easProjectId();
    const tokenResp = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return tokenResp.data ?? null;
  } catch (e) {
    logger.warn('getExpoPushToken failed', e);
    return null;
  }
}

// Upsert this device's token into the cloud (RLS: owner only). Best-effort.
export async function registerPushToken(
  role: 'teacher' | 'assistant',
  accessToken: string,
): Promise<void> {
  if (!accessToken) return;
  const token = await getExpoPushToken();
  if (!token) return;

  let deviceId: string | null = null;
  try { deviceId = await getDeviceId(); } catch { /* optional */ }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?on_conflict=token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        token,
        role,
        device_id: deviceId,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    logger.warn('registerPushToken upsert failed', e);
  }
}

// Subscribe to notification taps. `onResponse` is called with the notification's
// data payload ({ type, ... }) when the user taps any notification, so the
// caller can route by type (chat → thread, others → notification center).
// Returns an unsubscribe fn.
export function addNotificationResponseListener(
  onResponse: (data: Record<string, unknown>) => void,
): () => void {
  const N = getNotifications();
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    onResponse(data ?? {});
  });
  return () => sub.remove();
}
