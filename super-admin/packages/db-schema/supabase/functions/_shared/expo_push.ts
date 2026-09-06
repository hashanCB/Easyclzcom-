// Shared Expo push sender (U45). Fires notifications to the Expo push service.
// Best-effort: callers should not let push failures break the primary action.
// https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;                          // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
}

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  const valid = messages.filter((m) => typeof m.to === 'string' && m.to.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < valid.length; i += 100) {
    const batch = valid.slice(i, i + 100).map((m) => ({ sound: 'default', ...m }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error('expo push non-200', res.status, await res.text().catch(() => ''));
      }
    } catch (e) {
      console.error('expo push send failed', e);
    }
  }
}
