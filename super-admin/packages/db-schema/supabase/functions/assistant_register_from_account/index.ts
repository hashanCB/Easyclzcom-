// =============================================================================
// assistant_register_from_account — one-scan student resolve/register at the door
// =============================================================================
// Auth:   Assistant JWT (a real Supabase auth user; auth.uid() = assistant id)
// Input:  { account_id, class_id }
//
// The assistant scans a student's ACCOUNT QR (v1a.<accountId>). We:
//   1. Verify the caller is an active assistant who may add students to the class.
//   2. If the account already maps to a student in this class → return it
//      ("normal flow" — attendance / payment as usual).
//   3. Else, auto-dedupe by phone: if a student in this class has the same phone
//      and no linked account, link this account to that record and return it.
//   4. Else create a NEW student from the account (name + phone), with the class's
//      grade/batch/subject/language, link the account, and return it.
//
// New students are created join_status = 'confirmed' — an assistant physically
// registering someone at the door is the verification. (The 'pending_payment'
// money gate is only for the self-join class-code flow, which has no human check.)
//
// Output: { student: {id,name,student_code,grade,batch,card_version,join_status},
//           created: boolean, linked: boolean }
import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  class_id:   z.string().uuid(),
});

const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

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

  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const { account_id, class_id } = parsed.data;

  // Identify the assistant (auth.uid()).
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }
  const assistantId = user.id;

  const admin = adminClient();

  // Assistant must be active and allowed to add students to this class.
  const { data: assistant } = await admin
    .from('assistants')
    .select('id, teacher_id, is_active, deleted_at')
    .eq('id', assistantId)
    .maybeSingle();
  if (!assistant || !assistant.is_active || assistant.deleted_at) {
    return errorResponse({ code: 'forbidden', message: 'Assistant account is not active.' });
  }

  const { data: perm } = await admin
    .from('assistant_class_permissions')
    .select('can_add_student, deleted_at')
    .eq('assistant_id', assistantId)
    .eq('class_id', class_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!perm || perm.can_add_student !== true) {
    return errorResponse({ code: 'forbidden', message: 'You don’t have permission to add students to this class.' });
  }

  // Class must belong to the assistant's teacher.
  const { data: cls } = await admin
    .from('classes')
    .select('id, teacher_id, grade, batch, subject, language')
    .eq('id', class_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cls || cls.teacher_id !== assistant.teacher_id) {
    return errorResponse({ code: 'not_found', message: 'Class not found.' });
  }
  const teacherId = cls.teacher_id;

  // The scanned account.
  const { data: account } = await admin
    .from('student_accounts')
    .select('id, name, phone, is_active, deleted_at')
    .eq('id', account_id)
    .maybeSingle();
  if (!account || account.deleted_at) {
    return errorResponse({ code: 'not_found', message: 'That student account was not found.' });
  }

  const studentSelect = 'id, name, student_code, grade, batch, card_version, join_status, fee_type, custom_fee_cents';

  // Auto-resolve any pending join request for this account+class (e.g. the
  // student sent a code-based request earlier, then showed up in person). The
  // teacher should not see a stale "pending" card for a student who is already in.
  async function resolvePendingRequest(studentId: string) {
    await admin
      .from('class_join_requests')
      .update({ status: 'accepted', student_id: studentId, decided_at: new Date().toISOString() })
      .eq('class_id', class_id)
      .eq('student_account_id', account_id)
      .eq('status', 'pending');
  }

  // 1) Already linked to a student in THIS class? → normal flow.
  const { data: links } = await admin
    .from('student_account_links')
    .select('student_id')
    .eq('student_account_id', account_id)
    .eq('teacher_id', teacherId);
  const linkedIds = (links ?? []).map((l) => l.student_id);
  if (linkedIds.length > 0) {
    const { data: existing } = await admin
      .from('students')
      .select(studentSelect)
      .in('id', linkedIds)
      .eq('class_id', class_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) {
      await resolvePendingRequest(existing.id);
      return jsonResponse({ student: existing, created: false, linked: false });
    }
  }

  // 2) Dedupe by phone — link this account to a matching unlinked student.
  const acctPhone = onlyDigits(account.phone);
  if (acctPhone.length >= 7) {
    const { data: sameClass } = await admin
      .from('students')
      .select(studentSelect + ', student_phone')
      .eq('class_id', class_id)
      .is('deleted_at', null);
    for (const s of sameClass ?? []) {
      if (onlyDigits((s as { student_phone?: string }).student_phone) !== acctPhone) continue;
      // Only adopt it if it isn't already claimed by another account.
      const { data: claimed } = await admin
        .from('student_account_links')
        .select('id')
        .eq('student_id', s.id)
        .maybeSingle();
      if (claimed) continue;
      await admin.from('student_account_links').insert({
        student_account_id: account_id, teacher_id: teacherId, student_id: s.id,
      });
      await resolvePendingRequest(s.id);
      const { student_phone: _drop, ...student } = s as Record<string, unknown>;
      return jsonResponse({ student, created: false, linked: true });
    }
  }

  // 3) Create a new student from the account.
  const { data: created, error: insErr } = await admin
    .from('students')
    .insert({
      teacher_id: teacherId,
      class_id,
      created_by_assistant_id: assistantId,
      name: account.name,
      student_phone: account.phone,
      grade: cls.grade,
      batch: cls.batch,
      subject: cls.subject,
      language: cls.language,
      join_status: 'confirmed',
      // student_code omitted — the students_assign_code trigger assigns STU-####.
    })
    .select(studentSelect)
    .single();
  if (insErr || !created) {
    return errorResponse({ code: 'internal', message: 'Failed to register the student.', details: insErr?.message });
  }

  await admin.from('student_account_links').insert({
    student_account_id: account_id, teacher_id: teacherId, student_id: created.id,
  });
  await resolvePendingRequest(created.id);

  return jsonResponse({ student: created, created: true, linked: false });
});
