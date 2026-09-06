// =============================================================================
// broadcast_chat — teacher group chat / announcement send (U37, SRS §15.1,§15.3)
// =============================================================================
// Auth:   Teacher JWT.
// Input:  { target: { kind, value?, month? }, body }
//   kind = all | paid | unpaid | class | grade | batch | subject | language
// Output: { recipients, threads_created }
//
// Resolves the target student set, ensures a chat_thread exists for each, and
// inserts one chat_message (sender_role='teacher') into every thread. Students
// only ever receive — they can never be a broadcast sender (RLS + this fn).
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { BroadcastChatInput } from '../_shared/schema.ts';

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }
  const parsed = BroadcastChatInput.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const { target, body: messageBody } = parsed.data;

  // Targets that filter by a column value require `value`.
  const valueKinds = ['class', 'grade', 'batch', 'subject', 'language'];
  if (valueKinds.includes(target.kind) && !target.value) {
    return errorResponse({ code: 'invalid_input', message: `target.value is required for kind '${target.kind}'` });
  }

  // --- Identify calling teacher ---
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }
  const teacher_id = user.id;
  const admin = adminClient();

  // --- Resolve target students ---
  let q = admin
    .from('students')
    .select('id')
    .eq('teacher_id', teacher_id)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (target.kind === 'class') {
    // A student belongs to a class via the legacy primary class_id OR an active
    // student_classes enrollment (multi-class). Union both so nobody is missed.
    const { data: enrollRows } = await admin
      .from('student_classes')
      .select('student_id')
      .eq('teacher_id', teacher_id)
      .eq('class_id', target.value)
      .eq('is_active', true)
      .is('deleted_at', null);
    const enrollIds = [...new Set((enrollRows ?? []).map((r: { student_id: string }) => r.student_id))];
    q = enrollIds.length > 0
      ? q.or(`class_id.eq.${target.value},id.in.(${enrollIds.join(',')})`)
      : q.eq('class_id', target.value);
  }
  if (target.kind === 'grade')    q = q.eq('grade', target.value);
  if (target.kind === 'batch')    q = q.eq('batch', target.value);
  if (target.kind === 'subject')  q = q.eq('subject', target.value);
  if (target.kind === 'language') q = q.eq('language', target.value);

  const { data: studentRows, error: stuErr } = await q;
  if (stuErr) {
    console.error('students query failed', stuErr);
    return errorResponse({ code: 'server_error', message: 'Failed to resolve students' });
  }
  let studentIds = [...new Set((studentRows ?? []).map((s: { id: string }) => s.id))];

  // Global paid / unpaid (across all classes) for kind='paid'|'unpaid'.
  if (target.kind === 'paid' || target.kind === 'unpaid') {
    const month = target.month ?? currentMonth();
    const { data: paidRows } = await admin
      .from('payments')
      .select('student_id')
      .eq('teacher_id', teacher_id)
      .eq('month', month)
      .eq('status', 'paid')
      .is('deleted_at', null);
    const paidSet = new Set((paidRows ?? []).map((p: { student_id: string }) => p.student_id));
    studentIds = target.kind === 'paid'
      ? studentIds.filter((id) => paidSet.has(id))
      : studentIds.filter((id) => !paidSet.has(id));
  }

  // Class-scoped paid / unpaid sub-filter (kind='class' + payment): only the
  // students in this class who have / have not paid this class for the month.
  if (target.kind === 'class' && target.payment) {
    const month = target.month ?? currentMonth();
    const { data: paidRows } = await admin
      .from('payments')
      .select('student_id')
      .eq('teacher_id', teacher_id)
      .eq('class_id', target.value)
      .eq('month', month)
      .eq('status', 'paid')
      .is('deleted_at', null);
    const paidSet = new Set((paidRows ?? []).map((p: { student_id: string }) => p.student_id));
    studentIds = target.payment === 'paid'
      ? studentIds.filter((id) => paidSet.has(id))
      : studentIds.filter((id) => !paidSet.has(id));
  }

  if (studentIds.length === 0) {
    return jsonResponse({ recipients: 0, threads_created: 0 });
  }

  // --- Ensure a thread exists for every target student ---
  const { data: existingThreads } = await admin
    .from('chat_threads')
    .select('id, student_id')
    .eq('teacher_id', teacher_id)
    .in('student_id', studentIds);

  const threadByStudent = new Map<string, string>(
    (existingThreads ?? []).map((t: { id: string; student_id: string }) => [t.student_id, t.id]),
  );

  const missing = studentIds.filter((id) => !threadByStudent.has(id));
  let threadsCreated = 0;
  if (missing.length > 0) {
    const { data: created, error: createErr } = await admin
      .from('chat_threads')
      .insert(missing.map((sid) => ({ teacher_id, student_id: sid })))
      .select('id, student_id');
    if (createErr) {
      console.error('thread create failed', createErr);
      return errorResponse({ code: 'server_error', message: 'Failed to create chat threads' });
    }
    for (const t of (created ?? []) as { id: string; student_id: string }[]) {
      threadByStudent.set(t.student_id, t.id);
      threadsCreated++;
    }
  }

  // --- Insert one message per thread ---
  const messageRows = studentIds
    .map((sid) => threadByStudent.get(sid))
    .filter((tid): tid is string => !!tid)
    .map((thread_id) => ({
      teacher_id,
      thread_id,
      sender_role: 'teacher',
      sender_id: teacher_id,
      body: messageBody,
    }));

  const { error: msgErr } = await admin.from('chat_messages').insert(messageRows);
  if (msgErr) {
    console.error('message insert failed', msgErr);
    return errorResponse({ code: 'server_error', message: 'Failed to send messages' });
  }

  return jsonResponse({ recipients: messageRows.length, threads_created: threadsCreated });
});
