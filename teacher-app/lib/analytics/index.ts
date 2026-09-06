// =============================================================================
// Product analytics — lightweight, offline-friendly event logging.
//
// Goal: understand which features teachers use and where they drop off, without
// pulling in a heavy third-party SDK or slowing the app down.
//
// Design:
//   • logEvent(name, props?) is fire-and-forget — it never throws and never
//     blocks the UI. Events go into an in-memory queue.
//   • The queue is flushed in batches to the `analytics_events` table via
//     PostgREST: on a short timer, when it gets large, and when the app goes to
//     the background.
//   • Flushing is skipped while offline or signed-out; events wait in the queue
//     (capped, oldest-dropped) so we never grow memory unbounded.
//   • A per-launch session_id lets us reconstruct funnels / drop-off paths.
//
// Privacy: we only log feature names + small structured props (counts, screen
// names, source). Never log student/teacher personal data or message bodies.
// =============================================================================

import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { useAuthStore } from '../auth/store';
import { newId } from '../uuid';

type EventProps = Record<string, string | number | boolean | null>;

interface QueuedEvent {
  event: string;
  props: EventProps;
  session_id: string;
  client_ts: string;
}

const MAX_QUEUE = 200; // hard cap; drop oldest beyond this
const FLUSH_THRESHOLD = 20; // flush early once this many events pile up
const FLUSH_INTERVAL_MS = 20_000;

const appVersion =
  Constants.expoConfig?.version ?? (Constants as { nativeAppVersion?: string }).nativeAppVersion ?? 'unknown';

// One id per app launch — groups a user's events into a session.
const SESSION_ID = newId();

let queue: QueuedEvent[] = [];
let flushing = false;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

/**
 * Record a product-analytics event. Safe to call anywhere — fire-and-forget,
 * never throws, no await needed.
 */
export function logEvent(event: string, props: EventProps = {}): void {
  try {
    queue.push({
      event,
      props,
      session_id: SESSION_ID,
      client_ts: new Date().toISOString(),
    });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= FLUSH_THRESHOLD) void flush();
  } catch {
    // analytics must never break the app
  }
}

/**
 * Convenience for screen views — the backbone of drop-off / funnel analysis.
 */
export function logScreen(name: string, props: EventProps = {}): void {
  logEvent('screen.view', { name, ...props });
}

/**
 * Push queued events to the server. No-op when offline or signed-out (events
 * stay queued for the next attempt).
 */
export async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;

  const { session, teacher } = useAuthStore.getState();
  const token = session?.access_token;
  if (!token) return; // signed out — keep events for later

  try {
    const net = await NetInfo.fetch();
    if (net.isConnected === false) return; // offline — try again later
  } catch {
    // NetInfo unavailable — proceed and let the request fail gracefully
  }

  flushing = true;
  const batch = queue.slice(0, MAX_QUEUE);
  // role: teachers have a teacher profile; assistants sign in without one.
  const role = teacher ? 'teacher' : 'assistant';
  const rows = batch.map((e) => ({
    role,
    event: e.event,
    props: e.props,
    session_id: e.session_id,
    platform: Platform.OS,
    app_version: appVersion,
    client_ts: e.client_ts,
  }));

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (res.ok) {
      // Drop exactly what we sent (new events may have arrived meanwhile).
      queue = queue.slice(batch.length);
    }
    // On failure, leave the queue intact for the next attempt.
  } catch {
    // network/parse error — keep queued
  } finally {
    flushing = false;
  }
}

/**
 * Start background flushing (timer + flush when app backgrounds). Call once at
 * app startup. Idempotent.
 */
export function startAnalytics(): void {
  if (started) return;
  started = true;

  timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  AppState.addEventListener('change', (state) => {
    // Flush when leaving the foreground so we don't lose a session's tail.
    if (state === 'background' || state === 'inactive') void flush();
  });
}

/** Stop the flush timer (e.g. for tests). */
export function stopAnalytics(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
