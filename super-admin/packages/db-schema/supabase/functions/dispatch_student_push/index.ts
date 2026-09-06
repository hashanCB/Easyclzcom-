// =============================================================================
// dispatch_student_push — send a Web Push for one student_notifications row.
// =============================================================================
// Auth:   X-Dispatch-Secret header == STUDENT_PUSH_SECRET. Called only by the
//         create_student_notification() DB trigger via pg_net. verify_jwt=false.
// Input:  { notification_id }
// Output: { sent: number }
//
// Looks up the notification, finds every browser the student account has
// subscribed, and pushes the payload. Dead subscriptions (404/410) are pruned.
//
// Required secrets: STUDENT_PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//                   VAPID_SUBJECT
// =============================================================================

import webpush from 'npm:web-push@3.6.7';
import { adminClient } from '../_shared/supabase.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Internal-only: the DB trigger sends a shared secret. Reject everything else.
  const expected = Deno.env.get('STUDENT_PUSH_SECRET');
  if (!expected || req.headers.get('X-Dispatch-Secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const publicKey  = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject    = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@easyclz.com';
  if (!publicKey || !privateKey) {
    return json({ error: 'VAPID keys not configured' }, 500);
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  let body: { notification_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }
  const notificationId = body.notification_id;
  if (!notificationId) return json({ error: 'notification_id required' }, 400);

  const admin = adminClient();

  const { data: note } = await admin
    .from('student_notifications')
    .select('id, student_account_id, type, title, body, data')
    .eq('id', notificationId)
    .maybeSingle();
  if (!note) return json({ error: 'not found' }, 404);

  const { data: subs } = await admin
    .from('student_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('student_account_id', note.student_account_id);

  const list = subs ?? [];
  if (list.length === 0) return json({ sent: 0 });

  const payload = JSON.stringify({
    title: note.title,
    body:  note.body,
    type:  note.type,
    data:  note.data ?? {},
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(list.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) dead.push(s.id);
      else console.error('web push failed', status, (e as Error).message);
    }
  }));

  if (dead.length > 0) {
    await admin.from('student_push_subscriptions').delete().in('id', dead);
  }

  return json({ sent });
});
