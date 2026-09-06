// =============================================================================
// request_join_class — a signed-in student account asks to join a class by code.
// =============================================================================
// Auth:   None (public) — identity proven by account_id + phone matching a real
//         account (same pattern as the other student-portal functions).
// Input:  { code, account_id, phone }
// Output: { ok: true, request_id }
//
// Guards: account valid, class exists, not already enrolled in this class,
//         no pending request yet. The teacher decides via respond_join_request.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { notifyTeacher } from '../_shared/notify.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  code:       z.string().min(4).max(20),
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
});

function normaliseCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
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

  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input' });
  }
  const { account_id, phone } = parsed.data;
  const code = normaliseCode(parsed.data.code);

  const admin = adminClient();

  // 1. Verify the student account (id + phone must match, account active).
  const { data: account } = await admin
    .from('student_accounts')
    .select('id, name, phone, is_active, deleted_at')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (!account || account.deleted_at || account.is_active === false) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  // 2. Find the class.
  const { data: cls } = await admin
    .from('classes')
    .select('id, teacher_id')
    .eq('join_code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (!cls) {
    return errorResponse({ code: 'not_found', message: 'No class found for that code. Check it with your teacher.' });
  }

  // 3. Already enrolled? (account linked to a live student record in this
  //    class). Deactivated/deleted records don't count — the portal hides
  //    those classes, so the student must be able to request to join again.
  const { data: links } = await admin
    .from('student_account_links')
    .select('student_id, students!inner(class_id, deleted_at, is_active)')
    .eq('student_account_id', account_id)
    .eq('teacher_id', cls.teacher_id);

  const alreadyInClass = (links ?? []).some((l) => {
    const s = Array.isArray(l.students) ? l.students[0] : l.students;
    return s && s.class_id === cls.id && !s.deleted_at && s.is_active !== false;
  });
  if (alreadyInClass) {
    return errorResponse({ code: 'conflict', message: 'You are already in this class.' });
  }

  // 4. Pending request already? (the partial unique index also guards this —
  //    checking first gives a friendly message instead of a constraint error)
  const { data: pending } = await admin
    .from('class_join_requests')
    .select('id')
    .eq('class_id', cls.id)
    .eq('student_account_id', account_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (pending) {
    return errorResponse({ code: 'conflict', message: 'You already sent a request for this class. Wait for your teacher to accept it.' });
  }

  // 5. Create the request.
  const { data: created, error: insErr } = await admin
    .from('class_join_requests')
    .insert({
      teacher_id: cls.teacher_id,
      class_id: cls.id,
      student_account_id: account_id,
      student_name: account.name,
      student_phone: account.phone,
    })
    .select('id')
    .single();

  if (insErr || !created) {
    return errorResponse({ code: 'internal', message: 'Failed to send request. Please try again.' });
  }

  // Notify the teacher — in-app bell + push notification. Best-effort.
  await notifyTeacher({
    teacherId: cls.teacher_id,
    type: 'join_request',
    title: 'New join request',
    body: `${account.name} wants to join your class.`,
    data: { request_id: created.id, class_id: cls.id, student_name: account.name },
  });

  return jsonResponse({ ok: true, request_id: created.id });
});
