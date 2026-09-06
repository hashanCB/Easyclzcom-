// Shared notification helper for edge functions.
// Inserts a row into `notifications` (the in-app feed) AND sends the Expo push
// inline, so the teacher's phone buzzes even if pg_net isn't configured.
// Best-effort: callers should not let a notify failure break the primary action.

import { adminClient } from './supabase.ts';
import { sendExpoPush } from './expo_push.ts';

export type NotificationType =
  | 'chat'
  | 'sms_failed'
  | 'sms_low_balance'
  | 'payment'
  | 'assistant_attendance'
  | 'join_request'
  | 'system';

export interface NotifyInput {
  teacherId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Record an in-app notification and push it to the teacher's devices. */
export async function notifyTeacher(input: NotifyInput): Promise<void> {
  const admin = adminClient();
  const { teacherId, type, title, body, data = {} } = input;

  // 1. In-app feed row (the bell / list). Always attempt this first.
  try {
    await admin.from('notifications').insert({
      teacher_id: teacherId,
      type,
      title,
      body,
      data,
    });
  } catch (e) {
    console.error('notifyTeacher: insert failed', e);
  }

  // 2. Phone push (best-effort).
  try {
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', teacherId);
    const list = (tokens ?? []) as { token: string }[];
    if (list.length > 0) {
      await sendExpoPush(
        list.map((t) => ({
          to: t.token,
          title,
          body: body.slice(0, 178),
          data: { type, ...data },
        })),
      );
    }
  } catch (e) {
    console.error('notifyTeacher: push failed', e);
  }
}

// ─── Super-admin alerts ────────────────────────────────────────────────────
// Platform-level problems (SMS provider balance, send failures, quotas) are
// the super admin's responsibility, not the teacher's. These go to the
// system_alerts table, shown on the admin web app's Alerts page.

export interface SystemAlertInput {
  kind: string; // e.g. 'low_sms_balance', 'sms_send_failure'
  severity?: 'info' | 'warning' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  /** Skip if an alert of the same kind was already raised this recently. */
  cooldownMinutes?: number;
}

/** Record a system alert for the super admin (best-effort, deduped by kind). */
export async function raiseSystemAlert(input: SystemAlertInput): Promise<void> {
  const admin = adminClient();
  const { kind, severity = 'warning', message, details = {}, cooldownMinutes = 60 } = input;
  try {
    if (cooldownMinutes > 0) {
      const since = new Date(Date.now() - cooldownMinutes * 60_000).toISOString();
      const { data: recent } = await admin
        .from('system_alerts')
        .select('id')
        .eq('kind', kind)
        .gte('created_at', since)
        .limit(1)
        .maybeSingle();
      if (recent) return;
    }
    await admin.from('system_alerts').insert({ kind, severity, message, details, notified: false });
  } catch (e) {
    console.error('raiseSystemAlert failed', e);
  }
}
