// =============================================================================
// admin_resend_sms — super-admin re-sends a single failed/queued SMS
// =============================================================================
// Auth:   Super-admin JWT (Authorization: Bearer <access_token>)
// Input:  { message_id }
// Output: { status: 'sent' | 'failed', error: string | null }
//
// Flow:
//   1. Verify caller is super_admin.
//   2. Load the message; only 'failed' or 'queued' SMS may be re-sent.
//   3. Re-dispatch via text.lk using the admin-configured sender.
//   4. Update the row to 'sent' or 'failed', bumping retry_count.
//
// This reuses the same text.lk keys and sender resolution as send_sms, so a
// resend behaves exactly like the original teacher-triggered send.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { getCaller } from '../_shared/role.ts';
import { adminClient } from '../_shared/supabase.ts';
import { getSmsSender } from '../_shared/sms-config.ts';
import { sendSingle, checkBalance, type TextLkConfig } from '../_shared/textlk.ts';

const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS provider is not configured' });
  }

  // --- Auth: super_admin only ---
  const caller = await getCaller(req);
  if (!caller) {
    return errorResponse({ code: 'unauthorized', message: 'Sign-in required' });
  }
  if (caller.role !== 'super_admin') {
    return errorResponse({ code: 'forbidden', message: 'Super admin only' });
  }

  // --- Parse body ---
  let body: { message_id?: string };
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }
  const messageId = body.message_id;
  if (!messageId) {
    return errorResponse({ code: 'invalid_input', message: 'message_id is required' });
  }

  const admin = adminClient();

  // --- Load the message ---
  const { data: msg, error: loadErr } = await admin
    .from('messages')
    .select('id, status, channel, recipient_phone, body, retry_count')
    .eq('id', messageId)
    .maybeSingle();

  if (loadErr || !msg) {
    return errorResponse({ code: 'not_found', message: 'Message not found' });
  }
  if (msg.channel !== 'sms') {
    return errorResponse({ code: 'invalid_input', message: 'Only SMS messages can be re-sent' });
  }
  if (msg.status === 'sent' || msg.status === 'delivered') {
    return errorResponse({ code: 'invalid_input', message: 'This message already sent successfully' });
  }

  // --- Re-dispatch ---
  const cfg: TextLkConfig = {
    apiToken: TEXTLK_API_TOKEN,
    senderId: await getSmsSender(admin),
  };

  const balanceBefore = await checkBalance(cfg);

  let result;
  try {
    result = await sendSingle(cfg, msg.recipient_phone, msg.body);
  } catch (e) {
    result = {
      ok: false,
      raw: String(e),
      status: 0,
      costCents: null,
      providerMessageId: null,
      error: 'Could not reach the SMS provider',
    };
  }

  const ts = new Date().toISOString();
  const nextRetry = (msg.retry_count ?? 0) + 1;

  if (result.ok) {
    // Capture real spend via balance diff, like send_sms does.
    let costCents: number | null = result.costCents;
    const balanceAfter = await checkBalance(cfg);
    if (balanceBefore != null && balanceAfter != null) {
      const spent = Math.round((balanceBefore - balanceAfter) * 100);
      if (spent > 0) costCents = spent;
    }
    await admin
      .from('messages')
      .update({
        status: 'sent',
        sent_at: ts,
        failed_at: null,
        provider: 'textlk',
        provider_message_id: result.providerMessageId,
        cost_cents: costCents,
        error: null,
        retry_count: nextRetry,
        updated_at: ts,
      })
      .eq('id', msg.id);
  } else {
    await admin
      .from('messages')
      .update({
        status: 'failed',
        failed_at: ts,
        provider: 'textlk',
        error: result.error ?? 'SMS delivery failed',
        retry_count: nextRetry,
        updated_at: ts,
      })
      .eq('id', msg.id);
  }

  // --- Audit log (best-effort) ---
  await admin.from('audit_logs').insert({
    user_id: caller.user_id,
    user_role: 'super_admin',
    action: 'sms.resend',
    entity_type: 'message',
    entity_id: msg.id,
    new_value: { status: result.ok ? 'sent' : 'failed', retry_count: nextRetry },
    occurred_at: ts,
  }).then(undefined, (e: unknown) => console.error('audit insert failed', e));

  return jsonResponse({
    status: result.ok ? 'sent' : 'failed',
    error: result.ok ? null : (result.error ?? 'SMS delivery failed'),
  });
});
