// Web Push registration for the student portal.
// Works on Android/Chrome + desktop. On iPhone, push only works after the
// student adds the site to their Home Screen (Apple requirement, iOS 16.4+).

import { getGlobalSession } from './auth';

const SUPABASE_URL      = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\s/g, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s/g, '');
const VAPID_PUBLIC_KEY  = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').replace(/\s/g, '');

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** Current browser permission: 'granted' | 'denied' | 'default' | 'unsupported'. */
export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Register the service worker (safe to call repeatedly). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.warn('SW register failed', e);
    return null;
  }
}

/**
 * Ask for permission, subscribe to push, and save the subscription server-side.
 * Returns true on success. Call this from a user gesture (button click).
 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported() || !VAPID_PUBLIC_KEY) return false;
  const session = getGlobalSession();
  if (!session) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await ensureServiceWorker();
  if (!reg) return false;
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/save_student_push_subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        account_id: session.account.id,
        phone: session.account.phone,
        subscription: sub.toJSON(),
        user_agent: navigator.userAgent.slice(0, 400),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** True if this browser already has an active push subscription. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}
