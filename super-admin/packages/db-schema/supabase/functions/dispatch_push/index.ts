// =============================================================================
// dispatch_push — deliver a stored notification to a teacher's phones
// =============================================================================
// Called server-to-server by the create_notification() SQL helper via pg_net
// (Authorization: Bearer <service_role_key>). Loads the notification row and
// fans it out to the teacher's Expo push tokens.
//
// Input:  { notification_id }
// Output: { sent: <token count> }
//
// This path is only used for trigger-inserted notifications (payment /
// attendance). Edge functions that create notifications push inline instead.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendExpoPush } from '../_shared/expo_push.ts';

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  // Only the service role (pg_net) may call this.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SERVICE_ROLE_KEY || token !== SERVICE_ROLE_KEY) {
    return errorResponse({ code: 'unauthorized', message: 'Service role required' });
  }

  let body: { notification_id?: string };
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }
  const id = body.notification_id;
  if (!id) {
    return errorResponse({ code: 'invalid_input', message: 'notification_id is required' });
  }

  const admin = adminClient();

  const { data: n, error } = await admin
    .from('notifications')
    .select('teacher_id, type, title, body, data')
    .eq('id', id)
    .maybeSingle();

  if (error || !n) {
    return errorResponse({ code: 'not_found', message: 'Notification not found' });
  }

  const { data: tokens } = await admin
    .from('push_tokens')
    .select('token')
    .eq('user_id', n.teacher_id);
  const list = (tokens ?? []) as { token: string }[];

  if (list.length > 0) {
    await sendExpoPush(
      list.map((t) => ({
        to: t.token,
        title: n.title as string,
        body: (n.body as string).slice(0, 178),
        data: { type: n.type, ...((n.data as Record<string, unknown>) ?? {}) },
      })),
    );
  }

  return jsonResponse({ sent: list.length });
});
