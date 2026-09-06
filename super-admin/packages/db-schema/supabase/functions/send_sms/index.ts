// =============================================================================
// send_sms — send SMS via text.lk and log every message (U34)
// =============================================================================
// Auth:   Teacher JWT (Authorization: Bearer <teacher_access_token>)
// Input:  { type, messages: [{ recipient_phone, body, student_id?, class_id? }] }
//         (max 20 recipients per call — text.lk per-recipient limit)
// Output: { sent, failed, results: [{ message_id, status, error }] }
//
// Flow:
//   1. Verify caller is an authenticated teacher.
//   2. Insert one `messages` row per recipient (status='queued').
//   3. Dispatch via text.lk (SEND_SINGLE for 1, SEND_BULK_DIFFERENT for >1).
//   4. Update each row to 'sent' or 'failed' with provider/cost/error.
//
// Cost tracking: each message row stores cost_cents; per-teacher totals are a
// simple SUM over messages.teacher_id.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { SendSmsInput } from '../_shared/schema.ts';
import { sendSingle, sendBulkDifferent, checkBalance, type TextLkConfig } from '../_shared/textlk.ts';
import { notifyTeacher, raiseSystemAlert } from '../_shared/notify.ts';

// Alert the super admin when the text.lk account balance drops below this
// (LKR). The platform pays for SMS, so balance is the admin's responsibility —
// teachers are never shown provider balance or limit problems.
const LOW_BALANCE_THRESHOLD = 50;

const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";
const TEXTLK_SENDER_ID = Deno.env.get("TEXTLK_SENDER_ID") ?? "TextLKDemo";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS provider is not configured' });
  }

  // --- Parse + validate body ---
  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }
  const parsed = SendSmsInput.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const { type, messages } = parsed.data;

  // --- Identify calling teacher ---
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }
  const teacher_id = user.id;
  const admin = adminClient();

  const nowIso = () => new Date().toISOString();

  // --- Free-plan monthly quota ------------------------------------------------
  // SMS costs real money per message, so Free teachers get a small monthly
  // trial allowance; beyond that they must upgrade. Pro (active/trialing) is
  // unlimited. "Used" = messages this calendar month that were not failures
  // (matches get_sms_cost_summary).
  const FREE_SMS_QUOTA = 10;
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status')
    .eq('teacher_id', teacher_id)
    .maybeSingle();
  const isPro = sub?.status === 'active' || sub?.status === 'trialing';

  if (!isPro) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count: usedThisMonth } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacher_id)
      .eq('channel', 'sms')
      .is('deleted_at', null)
      .neq('status', 'failed')
      .gte('created_at', monthStart.toISOString());

    const used = usedThisMonth ?? 0;
    const remaining = Math.max(0, FREE_SMS_QUOTA - used);
    if (used + messages.length > FREE_SMS_QUOTA) {
      return errorResponse({
        code: 'pro_required',
        message: remaining === 0
          ? `You have used all ${FREE_SMS_QUOTA} free SMS this month. Upgrade to Pro for unlimited SMS.`
          : `Free plan allows ${FREE_SMS_QUOTA} SMS per month. You have ${remaining} left, but tried to send ${messages.length}. Upgrade to Pro for unlimited SMS.`,
      });
    }
  }

  // --- Per-teacher rate limit -------------------------------------------------
  // Stops a stolen token or runaway loop from burning the SMS balance. Counts
  // messages this teacher created in the last 60s; rejects if this call would
  // push the rolling total over the cap. A full class bulk send (≤ a few dozen)
  // still fits comfortably under the limit.
  const RATE_WINDOW_MS = 60_000;
  const MAX_PER_WINDOW = 100;
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacher_id)
    .gte('created_at', windowStart);
  if ((recentCount ?? 0) + messages.length > MAX_PER_WINDOW) {
    return errorResponse({
      code: 'rate_limited',
      message: `SMS limit reached (${MAX_PER_WINDOW} per minute). Please wait a moment and try again.`,
    });
  }

  // --- 1. Insert queued message rows ---
  const queuedRows = messages.map((m) => ({
    teacher_id,
    type,
    channel: 'sms',
    status: 'queued',
    recipient_phone: m.recipient_phone,
    student_id: m.student_id ?? null,
    class_id: m.class_id ?? null,
    body: m.body,
    provider: 'textlk',
  }));

  let { data: inserted, error: insertErr } = await admin
    .from('messages')
    .insert(queuedRows)
    .select('id, recipient_phone, body');

  // student_id / class_id point at rows that may not have synced to the cloud
  // yet (the app is offline-first). Those columns are only metadata links for
  // the Message Center — don't fail the whole SMS over a missing link. On a
  // foreign-key violation, retry once with the links nulled so the SMS still
  // sends and gets logged.
  if (insertErr && insertErr.code === '23503') {
    const fallback = queuedRows.map((r) => ({ ...r, student_id: null, class_id: null }));
    ({ data: inserted, error: insertErr } = await admin
      .from('messages')
      .insert(fallback)
      .select('id, recipient_phone, body'));
  }

  if (insertErr || !inserted) {
    console.error('messages insert failed', insertErr);
    return errorResponse({ code: 'server_error', message: 'Failed to queue messages' });
  }

  // --- 2. Dispatch via text.lk ---
  const cfg: TextLkConfig = {
    apiToken: TEXTLK_API_TOKEN,
    senderId: TEXTLK_SENDER_ID,
  };

  // text.lk's send endpoints don't return a per-message cost, so we diff the
  // account balance before/after the dispatch to capture the real spend.
  const balanceBefore = await checkBalance(cfg);

  let result;
  try {
    result = inserted.length === 1
      ? await sendSingle(cfg, inserted[0].recipient_phone, inserted[0].body)
      : await sendBulkDifferent(
          cfg,
          inserted.map((r: { recipient_phone: string; body: string }) => ({ to: r.recipient_phone, msg: r.body })),
        );
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

  // --- 3. Update every row with the dispatch outcome ---
  // text.lk reports a single outcome for the batch; we apply it to all rows.
  const ts = nowIso();

  // Determine total cost: prefer a balance diff, fall back to any cost the
  // provider returned. Spread evenly across recipients for per-message rows.
  let totalCostCents: number | null = result.costCents;
  if (result.ok) {
    const balanceAfter = await checkBalance(cfg);
    if (balanceBefore != null && balanceAfter != null) {
      const spent = Math.round((balanceBefore - balanceAfter) * 100);
      if (spent > 0) totalCostCents = spent;
    }
  }
  const perMsgCost =
    totalCostCents != null && inserted.length > 0
      ? Math.round(totalCostCents / inserted.length)
      : null;

  if (result.ok) {
    await admin
      .from('messages')
      .update({
        status: 'sent',
        sent_at: ts,
        provider: 'textlk',
        provider_message_id: result.providerMessageId,
        cost_cents: perMsgCost,
        error: null,
        updated_at: ts,
      })
      .in('id', inserted.map((r: { id: string }) => r.id));

    // Low-balance warning → super admin only (best-effort).
    try {
      const balanceAfter = await checkBalance(cfg);
      if (balanceAfter != null && balanceAfter < LOW_BALANCE_THRESHOLD) {
        await raiseSystemAlert({
          kind: 'low_sms_balance',
          severity: 'warning',
          message: `SMS provider balance is low (LKR ${balanceAfter.toFixed(2)}). Top up to keep messages sending.`,
          details: { balance: balanceAfter, threshold: LOW_BALANCE_THRESHOLD },
        });
      }
    } catch (e) {
      console.error('low-balance alert failed', e);
    }
  } else {
    await admin
      .from('messages')
      .update({
        status: 'failed',
        failed_at: ts,
        provider: 'textlk',
        error: result.error ?? 'SMS delivery failed',
        retry_count: 0,
        updated_at: ts,
      })
      .in('id', inserted.map((r: { id: string }) => r.id));

    // Tell the teacher their SMS failed — generic message only. Provider
    // problems (balance, sending limits) are the super admin's job, so the
    // real error goes to system_alerts, never to the teacher.
    try {
      const count = inserted.length;
      await notifyTeacher({
        teacherId: teacher_id,
        type: 'sms_failed',
        title: count > 1 ? `${count} SMS failed to send` : 'SMS failed to send',
        body: 'The message could not be sent. Please try again later.',
        data: { message_ids: inserted.map((r: { id: string }) => r.id) },
      });
    } catch (e) {
      console.error('sms-failed notify failed', e);
    }

    // Full provider error → super admin.
    try {
      await raiseSystemAlert({
        kind: 'sms_send_failure',
        severity: 'critical',
        message: `SMS dispatch failed: ${result.error ?? 'unknown provider error'}`,
        details: {
          provider_status: result.status,
          teacher_id,
          message_count: inserted.length,
          error: result.error ?? null,
        },
        cooldownMinutes: 15,
      });
    } catch (e) {
      console.error('sms-failure alert failed', e);
    }
  }

  const finalStatus = result.ok ? 'sent' : 'failed';
  return jsonResponse({
    sent: result.ok ? inserted.length : 0,
    failed: result.ok ? 0 : inserted.length,
    provider_status: result.status,
    results: inserted.map((r: { id: string }) => ({
      message_id: r.id,
      status: finalStatus,
      error: result.ok ? null : result.error,
    })),
  });
});
