// =============================================================================
// dispatch_reminders — scheduled payment-reminder dispatcher (U35, SRS §13.3)
// =============================================================================
// Invoked every 15 minutes by the `dispatch-payment-reminders` pg_cron job.
// Auth: caller must present `Authorization: Bearer <CRON_SECRET>` — the cron
//       job builds this header from the `cron_secret` Vault secret. Deploy
//       with --no-verify-jwt so the gateway forwards the request.
//
// For each class whose reminder day-of-month + time has arrived (and which has
// not already been dispatched this month), it SMSes the parents of every
// student without a 'paid' payment for the current month, logs each message,
// and records a reminder_dispatch_log row so it never repeats.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendSingle, sendBulkDifferent, checkBalance, type TextLkConfig } from '../_shared/textlk.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";
const TEXTLK_SENDER_ID = Deno.env.get("TEXTLK_SENDER_ID") ?? "TextLKDemo";

// Sri Lanka has no DST; a fixed +5:30 offset is correct year-round.
const LK_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DEFAULT_REMINDER_BODY =
  'Dear {parent_name}, this is a reminder that {student_name}\'s class fee of ' +
  '{amount} for {month} is due by {due_date}. Please settle at your earliest ' +
  'convenience. - {teacher_name}';

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

function fmtMoney(cents: number): string {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

interface ClassRow {
  id: string;
  teacher_id: string;
  grade: string;
  batch: string;
  subject: string;
  language: string;
  monthly_fee_cents: number;
  payment_reminder_day_of_month: number;
  payment_reminder_time: string;
}

interface StudentRow {
  id: string;
  name: string;
  parent_name: string | null;
  parent_mobile: string | null;
  student_phone: string | null;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  // --- Auth: shared cron secret only (cron caller) ---
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!CRON_SECRET || bearer !== CRON_SECRET) {
    return errorResponse({ code: 'unauthorized', message: 'Not authorized' });
  }

  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS provider is not configured' });
  }

  const admin = adminClient();
  const cfg: TextLkConfig = {
    apiToken: TEXTLK_API_TOKEN,
    senderId: TEXTLK_SENDER_ID,
  };

  // --- Current Sri Lanka date/time ---
  const lkNow = new Date(Date.now() + LK_OFFSET_MS);
  const dayOfMonth = lkNow.getUTCDate();
  const nowMinutes = lkNow.getUTCHours() * 60 + lkNow.getUTCMinutes();
  const monthKey = `${lkNow.getUTCFullYear()}-${String(lkNow.getUTCMonth() + 1).padStart(2, '0')}`;
  const nowIso = new Date().toISOString();

  // --- Classes whose reminder is scheduled for today ---
  const { data: classes, error: classErr } = await admin
    .from('classes')
    .select('id, teacher_id, grade, batch, subject, language, monthly_fee_cents, payment_reminder_day_of_month, payment_reminder_time')
    .eq('is_active', true)
    .eq('payment_reminder_active', true)
    .eq('payment_reminder_day_of_month', dayOfMonth)
    .is('deleted_at', null)
    .not('payment_reminder_time', 'is', null);

  if (classErr) {
    console.error('classes query failed', classErr);
    return errorResponse({ code: 'server_error', message: 'Failed to load classes' });
  }

  const summary = { classes_processed: 0, classes_skipped: 0, sent: 0, failed: 0 };

  for (const cls of (classes ?? []) as ClassRow[]) {
    // Reminder time must already have passed (HH:MM:SS).
    const [h, m] = cls.payment_reminder_time.split(':').map(Number);
    if (h * 60 + m > nowMinutes) { summary.classes_skipped++; continue; }

    // Idempotency claim (CRON-1/CRON-2): atomically insert the dispatch-log row
    // BEFORE sending anything. The unique(class_id, month) constraint means a
    // concurrent or repeat run that hits the same class fails this insert and
    // skips — so we can never double-send. If the function crashes mid-send,
    // the claim already exists, so the retry skips instead of re-sending
    // (safe failure mode: under-send, never over-send). Counts are filled in
    // after dispatch via an update on claim.id.
    const { data: claim, error: claimErr } = await admin
      .from('reminder_dispatch_log')
      .insert({ class_id: cls.id, teacher_id: cls.teacher_id, month: monthKey, student_count: 0 })
      .select('id')
      .maybeSingle();
    if (claimErr || !claim) {
      // 23505 unique violation = already dispatched this month → skip quietly.
      summary.classes_skipped++;
      continue;
    }
    const claimId = claim.id as string;

    // --- Unpaid students = active students with no 'paid' payment this month ---
    const { data: students } = await admin
      .from('students')
      .select('id, name, parent_name, parent_mobile, student_phone')
      .eq('class_id', cls.id)
      .eq('is_active', true)
      .is('deleted_at', null);

    const { data: paidRows } = await admin
      .from('payments')
      .select('student_id')
      .eq('class_id', cls.id)
      .eq('month', monthKey)
      .eq('status', 'paid')
      .is('deleted_at', null);

    const paidIds = new Set((paidRows ?? []).map((p: { student_id: string }) => p.student_id));
    const unpaid = ((students ?? []) as StudentRow[]).filter(
      (s) => !paidIds.has(s.id) && (s.parent_mobile || s.student_phone),
    );

    // --- Teacher name + default reminder template ---
    const { data: teacher } = await admin
      .from('teachers')
      .select('name, username')
      .eq('id', cls.teacher_id)
      .maybeSingle();
    const teacherName = teacher?.name ?? teacher?.username ?? 'Your Teacher';

    // Prefer the teacher's default payment_reminder template in the class
    // language; if none is marked default, fall back to ANY template of that
    // type+language (CRON-3); only then fall back to the hard-coded English body.
    const { data: tmplRows } = await admin
      .from('message_templates')
      .select('body, is_default')
      .eq('teacher_id', cls.teacher_id)
      .eq('type', 'payment_reminder')
      .eq('language', cls.language)
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .limit(1);
    const templateBody = (tmplRows && tmplRows[0]?.body) ?? DEFAULT_REMINDER_BODY;

    const dueDate = `${monthKey}-${String(cls.payment_reminder_day_of_month).padStart(2, '0')}`;
    const className = `${cls.grade} ${cls.batch} ${cls.subject}`.trim();

    // --- Build per-student messages ---
    const items = unpaid.map((s) => ({
      student_id: s.id,
      phone: (s.parent_mobile ?? s.student_phone) as string,
      body: renderTemplate(templateBody, {
        parent_name: s.parent_name ?? 'Parent',
        student_name: s.name,
        class_name: className,
        grade: cls.grade,
        batch: cls.batch,
        subject: cls.subject,
        language: cls.language,
        month: monthKey,
        amount: fmtMoney(cls.monthly_fee_cents),
        due_date: dueDate,
        teacher_name: teacherName,
      }),
    }));

    let classSent = 0;
    let classFailed = 0;

    if (items.length > 0) {
      // Insert queued message rows.
      const { data: inserted, error: insertErr } = await admin
        .from('messages')
        .insert(items.map((it) => ({
          teacher_id: cls.teacher_id,
          type: 'payment_reminder',
          channel: 'sms',
          status: 'queued',
          recipient_phone: it.phone,
          student_id: it.student_id,
          class_id: cls.id,
          body: it.body,
          provider: 'textlk',
          scheduled_at: nowIso,
        })))
        .select('id, recipient_phone, body');

      // CRON-2: if we couldn't even queue the messages, release the claim so the
      // next cron tick retries this class instead of skipping it forever.
      if (insertErr || !inserted) {
        console.error('messages insert failed; releasing claim', cls.id, insertErr);
        await admin.from('reminder_dispatch_log').delete().eq('id', claimId);
        summary.classes_skipped++;
        continue;
      }

      const rows = inserted as { id: string; recipient_phone: string; body: string }[];

      // Dispatch in batches of 20 (text.lk per-recipient limit).
      for (let i = 0; i < rows.length; i += 20) {
        const batch = rows.slice(i, i + 20);
        const balanceBefore = await checkBalance(cfg);

        let result;
        try {
          result = batch.length === 1
            ? await sendSingle(cfg, batch[0].recipient_phone, batch[0].body)
            : await sendBulkDifferent(cfg, batch.map((b) => ({ to: b.recipient_phone, msg: b.body })));
        } catch (e) {
          result = { ok: false, raw: String(e), status: 0, costCents: null, providerMessageId: null, error: 'Provider unreachable' };
        }

        const ts = new Date().toISOString();
        let costCents = result.costCents;
        if (result.ok) {
          const after = await checkBalance(cfg);
          if (balanceBefore != null && after != null) {
            const spent = Math.round((balanceBefore - after) * 100);
            if (spent > 0) costCents = spent;
          }
        }
        const perMsg = costCents != null && batch.length > 0 ? Math.round(costCents / batch.length) : null;
        const ids = batch.map((b) => b.id);

        if (result.ok) {
          await admin.from('messages').update({
            status: 'sent', sent_at: ts, provider: 'textlk',
            provider_message_id: result.providerMessageId, cost_cents: perMsg,
            error: null, updated_at: ts,
          }).in('id', ids);
          classSent += batch.length;
        } else {
          await admin.from('messages').update({
            status: 'failed', failed_at: ts, provider: 'textlk',
            error: result.error ?? 'SMS delivery failed', updated_at: ts,
          }).in('id', ids);
          classFailed += batch.length;
        }
      }
    }

    // Fill in the final counts on the claim row created before dispatch.
    await admin.from('reminder_dispatch_log').update({
      student_count: items.length,
      sent_count: classSent,
      failed_count: classFailed,
    }).eq('id', claimId);

    summary.classes_processed++;
    summary.sent += classSent;
    summary.failed += classFailed;
  }

  return jsonResponse(summary);
});
