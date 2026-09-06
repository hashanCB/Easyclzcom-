// =============================================================================
// send_payment_receipt — SMS a parent a receipt for one recorded payment.
// =============================================================================
// Invoked by the `payments_send_receipt` AFTER INSERT trigger (via pg_net) when
// a payment syncs to the cloud and the teacher has opted in.
// Auth: caller must present `Authorization: Bearer <CRON_SECRET>` — the trigger
//       builds this from the `cron_secret` Vault secret. Deploy with
//       --no-verify-jwt so the gateway forwards the request.
//
// Input:  { payment_id }
// Flow:
//   1. Verify the cron secret.
//   2. Load the payment; bail unless it's real money (paid/partial/advance).
//   3. Re-check the teacher opt-in flag (defence in depth).
//   4. Resolve the parent phone + render the receipt (teacher template or default).
//   5. Idempotency: skip if a receipt message already exists for this payment.
//   6. Insert a `messages` row (linked via payment_id) and dispatch via text.lk.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { getSmsSender } from '../_shared/sms-config.ts';
import { sendSingle, checkBalance, type TextLkConfig } from '../_shared/textlk.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";

const DEFAULT_RECEIPT_BODY =
  'Dear {parent_name}, we received {amount} for {student_name}\'s {class_name} ' +
  'fee for {month}. Balance: {balance}. Thank you. - {teacher_name}';

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

function fmtMoney(cents: number): string {
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

interface PaymentRow {
  id: string;
  teacher_id: string;
  student_id: string;
  class_id: string;
  month: string;
  amount_cents: number;
  status: string;
  deleted_at: string | null;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  // --- Auth: shared cron secret (trigger caller) ---
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!CRON_SECRET || bearer !== CRON_SECRET) {
    return errorResponse({ code: 'unauthorized', message: 'Not authorized' });
  }

  if (!TEXTLK_API_TOKEN) {
    return errorResponse({ code: 'server_error', message: 'SMS provider is not configured' });
  }

  let body: { payment_id?: string };
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }
  const paymentId = body.payment_id;
  if (!paymentId) {
    return errorResponse({ code: 'invalid_input', message: 'payment_id is required' });
  }

  const admin = adminClient();

  // --- 1. Load the payment ---
  const { data: payment, error: payErr } = await admin
    .from('payments')
    .select('id, teacher_id, student_id, class_id, month, amount_cents, status, deleted_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (payErr || !payment) {
    return errorResponse({ code: 'not_found', message: 'Payment not found' });
  }
  const pay = payment as PaymentRow;

  // Only receipt real money received.
  if (pay.deleted_at || !['paid', 'partial', 'advance'].includes(pay.status) || pay.amount_cents <= 0) {
    return jsonResponse({ skipped: 'not_a_receipt_eligible_payment' });
  }

  // --- 2. Idempotency: one receipt per payment ---
  const { data: existing } = await admin
    .from('messages')
    .select('id')
    .eq('payment_id', pay.id)
    .eq('type', 'payment_received')
    .limit(1);
  if (existing && existing.length > 0) {
    return jsonResponse({ skipped: 'receipt_already_sent' });
  }

  // --- 3. Teacher opt-in (defence in depth) + name ---
  const { data: teacher } = await admin
    .from('teachers')
    .select('name, username, send_payment_receipt')
    .eq('id', pay.teacher_id)
    .maybeSingle();
  if (!teacher || teacher.send_payment_receipt !== true) {
    return jsonResponse({ skipped: 'receipts_disabled' });
  }
  const teacherName = teacher.name ?? teacher.username ?? 'Your Teacher';

  // --- 4. Student (recipient) ---
  const { data: student } = await admin
    .from('students')
    .select('id, name, parent_name, parent_mobile, student_phone')
    .eq('id', pay.student_id)
    .maybeSingle();
  if (!student) {
    return jsonResponse({ skipped: 'student_not_found' });
  }
  // Send to the student's REGISTERED phone first (the canonical contact the
  // student signed up with); fall back to the parent mobile only if the student
  // has no registered number, so a receipt is never silently dropped.
  const phone = student.student_phone ?? student.parent_mobile;
  if (!phone) {
    return jsonResponse({ skipped: 'no_recipient_phone' });
  }

  // --- 5. Class (for label + template language + balance) ---
  const { data: cls } = await admin
    .from('classes')
    .select('grade, batch, subject, language, monthly_fee_cents')
    .eq('id', pay.class_id)
    .maybeSingle();
  const className = cls ? `${cls.grade} ${cls.batch} ${cls.subject}`.trim() : '';
  const language = cls?.language ?? 'english';

  // Balance after this payment = monthly fee minus total paid this month.
  let balanceStr = '';
  if (cls?.monthly_fee_cents != null) {
    const { data: paidRows } = await admin
      .from('payments')
      .select('amount_cents')
      .eq('student_id', pay.student_id)
      .eq('class_id', pay.class_id)
      .eq('month', pay.month)
      .in('status', ['paid', 'partial', 'advance'])
      .is('deleted_at', null);
    const totalPaid = (paidRows ?? []).reduce(
      (sum: number, r: { amount_cents: number }) => sum + r.amount_cents, 0);
    const balance = cls.monthly_fee_cents - totalPaid;
    balanceStr = balance > 0 ? fmtMoney(balance) : 'Settled';
  }

  // --- 6. Template: teacher's default payment_received in the class language,
  //         else any of that type+language, else the hard-coded default. ---
  const { data: tmplRows } = await admin
    .from('message_templates')
    .select('body, is_default')
    .eq('teacher_id', pay.teacher_id)
    .eq('type', 'payment_received')
    .eq('language', language)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .limit(1);
  const templateBody = (tmplRows && tmplRows[0]?.body) ?? DEFAULT_RECEIPT_BODY;

  const messageBody = renderTemplate(templateBody, {
    parent_name: student.parent_name ?? 'Parent',
    student_name: student.name,
    class_name: className,
    grade: cls?.grade ?? '',
    batch: cls?.batch ?? '',
    subject: cls?.subject ?? '',
    language,
    month: pay.month,
    amount: fmtMoney(pay.amount_cents),
    balance: balanceStr,
    teacher_name: teacherName,
  });

  // --- 7. Insert queued message row (linked to the payment) ---
  const { data: inserted, error: insertErr } = await admin
    .from('messages')
    .insert({
      teacher_id: pay.teacher_id,
      type: 'payment_received',
      channel: 'sms',
      status: 'queued',
      recipient_phone: phone,
      student_id: pay.student_id,
      class_id: pay.class_id,
      payment_id: pay.id,
      body: messageBody,
      provider: 'textlk',
    })
    .select('id')
    .maybeSingle();

  if (insertErr || !inserted) {
    console.error('receipt message insert failed', insertErr);
    return errorResponse({ code: 'server_error', message: 'Failed to queue receipt' });
  }
  const messageId = inserted.id as string;

  // --- 8. Dispatch via text.lk (single recipient) ---
  const cfg: TextLkConfig = {
    apiToken: TEXTLK_API_TOKEN,
    senderId: await getSmsSender(admin),
  };

  const balanceBefore = await checkBalance(cfg);
  let result;
  try {
    result = await sendSingle(cfg, phone, messageBody);
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

  if (result.ok) {
    await admin.from('messages').update({
      status: 'sent', sent_at: ts, provider: 'textlk',
      provider_message_id: result.providerMessageId, cost_cents: costCents,
      error: null, updated_at: ts,
    }).eq('id', messageId);
  } else {
    await admin.from('messages').update({
      status: 'failed', failed_at: ts, provider: 'textlk',
      error: result.error ?? 'SMS delivery failed', updated_at: ts,
    }).eq('id', messageId);
  }

  return jsonResponse({
    message_id: messageId,
    status: result.ok ? 'sent' : 'failed',
    error: result.ok ? null : result.error,
  });
});
