// =============================================================================
// respond_join_request — teacher accepts or rejects a student's join request.
// =============================================================================
// Auth:   Teacher JWT
// Input:  { request_id, action: 'accept' | 'reject', existing_student_id? }
//   - accept without existing_student_id → creates a NEW students row from the
//     request (name + phone from the student's account; grade/batch/subject/
//     language copied from the class; STU-#### code assigned by the DB trigger),
//     then links the student account to it.
//   - accept with existing_student_id → links the student account to that
//     manually-added student record instead (the "this is the same Kasun" case).
//   - reject → marks the request rejected. The student can request again later.
// Output: { ok: true, student_id? }
//
// The teacher app runs a sync after accepting so the new student row appears
// in the local offline DB via the normal pull.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { phoneKey } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  request_id:          z.string().uuid(),
  action:              z.enum(['accept', 'reject']),
  existing_student_id: z.string().uuid().optional(),
});

// Put the student account's profile photo onto the teacher's student record so
// it shows in the teacher app. The photo is a small downscaled data URL, stored
// directly in profile_photo_url (the teacher app renders data: URLs directly and
// resolves R2 keys otherwise). We don't overwrite a photo the teacher already
// set. Best-effort: any failure is swallowed so it never blocks the join.
// Ensure the student has an active per-class enrollment (student_classes row)
// for `classId`. Idempotent: revives a soft-deleted row, no-ops if already
// active. New enrollments use the class's regular fee. Bumps client_updated_at
// so the teacher app's offline sync pulls it.
async function ensureEnrollment(
  admin: ReturnType<typeof adminClient>,
  teacherId: string,
  studentId: string,
  classId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from('student_classes')
    .select('id, deleted_at')
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .maybeSingle();

  if (existing) {
    if (existing.deleted_at) {
      await admin
        .from('student_classes')
        .update({ deleted_at: null, is_active: true, updated_at: now, client_updated_at: now })
        .eq('id', existing.id);
    }
    return;
  }

  await admin.from('student_classes').insert({
    id: crypto.randomUUID(),
    teacher_id: teacherId,
    student_id: studentId,
    class_id: classId,
    fee_type: 'regular',
    is_active: true,
    client_updated_at: now,
  });
}

async function applyAccountPhoto(
  admin: ReturnType<typeof adminClient>,
  accountId: string,
  studentId: string,
): Promise<void> {
  try {
    const { data: acct } = await admin
      .from('student_accounts')
      .select('profile_photo')
      .eq('id', accountId)
      .maybeSingle();
    const photo = acct?.profile_photo as string | null | undefined;
    if (!photo) return;

    const { data: stu } = await admin
      .from('students')
      .select('profile_photo_url')
      .eq('id', studentId)
      .maybeSingle();
    if (stu?.profile_photo_url) return; // keep a teacher-set photo

    const stamp = new Date().toISOString();
    await admin
      .from('students')
      .update({ profile_photo_url: photo, client_updated_at: stamp, updated_at: stamp })
      .eq('id', studentId);
  } catch {
    /* best-effort — never block the join over a photo */
  }
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
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const { request_id, action, existing_student_id } = parsed.data;

  // Identify the teacher.
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }
  const teacherId = user.id;

  const admin = adminClient();

  // Load the request — must belong to this teacher and still be pending.
  const { data: request } = await admin
    .from('class_join_requests')
    .select('id, teacher_id, class_id, student_account_id, student_name, student_phone, status')
    .eq('id', request_id)
    .maybeSingle();

  if (!request || request.teacher_id !== teacherId) {
    return errorResponse({ code: 'not_found', message: 'Request not found.' });
  }
  if (request.status !== 'pending') {
    return errorResponse({ code: 'conflict', message: 'This request was already handled.' });
  }

  // ---- Reject ----------------------------------------------------------------
  if (action === 'reject') {
    await admin
      .from('class_join_requests')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .eq('id', request_id);
    return jsonResponse({ ok: true });
  }

  // ---- Accept ----------------------------------------------------------------
  let studentId: string;

  if (existing_student_id) {
    // Link to a student record the teacher already created manually.
    const { data: student } = await admin
      .from('students')
      .select('id, class_id')
      .eq('id', existing_student_id)
      .eq('teacher_id', teacherId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!student) {
      return errorResponse({ code: 'not_found', message: 'That student record was not found.' });
    }

    // Already claimed by a different (live) account?
    const { data: claimed } = await admin
      .from('student_account_links')
      .select('id, student_account_id')
      .eq('student_id', student.id)
      .maybeSingle();

    if (claimed && claimed.student_account_id !== request.student_account_id) {
      const { data: otherAcct } = await admin
        .from('student_accounts')
        .select('deleted_at, is_active')
        .eq('id', claimed.student_account_id)
        .maybeSingle();
      const isStale = !otherAcct || otherAcct.deleted_at || !otherAcct.is_active;
      if (isStale) {
        await admin.from('student_account_links').delete().eq('id', claimed.id);
      } else {
        return errorResponse({
          code: 'conflict',
          message: 'That student record is already linked to a different student account.',
        });
      }
    }

    studentId = student.id;
  } else {
    // De-duplicate by the REAL student (one record per phone), not per class.
    // 1) If this teacher already has a student linked to this account, reuse it.
    // 2) Else match by phone across ALL of the teacher's classes.
    // 3) Only create a brand-new record when neither matches.
    // The joined class is added as a per-class enrollment (student_classes) in
    // the common tail below, so a repeat join never spawns a duplicate student.
    let matchId: string | null = null;

    const { data: acctLinks } = await admin
      .from('student_account_links')
      .select('student_id')
      .eq('student_account_id', request.student_account_id)
      .eq('teacher_id', teacherId)
      .limit(1);
    if (acctLinks && acctLinks.length > 0) {
      matchId = acctLinks[0].student_id as string;
    }

    if (!matchId && request.student_phone) {
      // Match by phone, format-agnostic. The teacher may have typed the number
      // as 0771234567, +94771234567, 94771234567 or with spaces; the account
      // phone is canonical local format. Compare by the last-9-digit key so any
      // of these merge into the teacher's existing record instead of duplicating.
      const wantKey = phoneKey(request.student_phone);
      let phoneMatch: { id: string } | null = null;

      if (wantKey) {
        // Fast path: exact stored match (the common case, one indexed lookup).
        const { data: exact } = await admin
          .from('students')
          .select('id')
          .eq('teacher_id', teacherId)
          .eq('student_phone', request.student_phone)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        phoneMatch = exact ?? null;

        // Fallback: scan the teacher's live students and compare normalized keys
        // (catches +94/94/spaced numbers the exact match misses).
        if (!phoneMatch) {
          const { data: candidates } = await admin
            .from('students')
            .select('id, student_phone')
            .eq('teacher_id', teacherId)
            .is('deleted_at', null)
            .not('student_phone', 'is', null);
          const hit = (candidates ?? []).find((s) => phoneKey(s.student_phone) === wantKey);
          if (hit) phoneMatch = { id: hit.id as string };
        }
      }

      if (phoneMatch) {
        // Don't steal a record already claimed by a different LIVE account.
        const { data: claimed } = await admin
          .from('student_account_links')
          .select('id, student_account_id')
          .eq('student_id', phoneMatch.id)
          .maybeSingle();

        if (claimed && claimed.student_account_id !== request.student_account_id) {
          const { data: otherAcct } = await admin
            .from('student_accounts')
            .select('deleted_at, is_active')
            .eq('id', claimed.student_account_id)
            .maybeSingle();
          const isStale = !otherAcct || otherAcct.deleted_at || !otherAcct.is_active;
          if (isStale) {
            await admin.from('student_account_links').delete().eq('id', claimed.id);
            matchId = phoneMatch.id;
          } else {
            return errorResponse({
              code: 'conflict',
              message: 'That phone number is already linked to a different student account.',
            });
          }
        } else {
          matchId = phoneMatch.id;
        }
      }
    }

    if (matchId) {
      studentId = matchId;
    } else {
      // No existing student — create a new record from the request.
      // Plan limit: the DB trigger skips service-role inserts, so check here.
      const { data: limitRow } = await admin
        .rpc('teacher_student_limit', { p_teacher: teacherId });
      const limit = typeof limitRow === 'number' ? limitRow : null;

      if (limit != null) {
        const { count } = await admin
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('teacher_id', teacherId)
          .is('deleted_at', null);
        if ((count ?? 0) >= limit) {
          return errorResponse({
            code: 'student_limit_reached',
            message: `Your plan allows up to ${limit} students. Upgrade your plan to accept more.`,
          });
        }
      }

      // grade/batch/subject/language come from the class the student asked to join.
      const { data: cls } = await admin
        .from('classes')
        .select('id, grade, batch, subject, language')
        .eq('id', request.class_id)
        .eq('teacher_id', teacherId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!cls) {
        return errorResponse({ code: 'not_found', message: 'The class no longer exists.' });
      }

      const { data: created, error: insErr } = await admin
        .from('students')
        .insert({
          teacher_id: teacherId,
          class_id: cls.id,
          name: request.student_name,
          student_phone: request.student_phone,
          grade: cls.grade,
          batch: cls.batch,
          subject: cls.subject,
          language: cls.language,
          // Self-joined student: money gate — excluded from unpaid lists until
          // first payment.
          join_status: 'pending_payment',
          // student_code omitted — students_assign_code trigger assigns STU-####.
        })
        .select('id')
        .single();

      if (insErr || !created) {
        return errorResponse({ code: 'internal', message: 'Failed to create the student record.', details: insErr?.message });
      }
      studentId = created.id;
    }
  }

  // Link the student account to the record (idempotent for re-links).
  const { data: existingLink } = await admin
    .from('student_account_links')
    .select('id')
    .eq('student_account_id', request.student_account_id)
    .eq('student_id', studentId)
    .maybeSingle();

  if (!existingLink) {
    const { error: linkErr } = await admin.from('student_account_links').insert({
      student_account_id: request.student_account_id,
      teacher_id: teacherId,
      student_id: studentId,
    });
    if (linkErr) {
      return errorResponse({ code: 'internal', message: 'Failed to link the student account.', details: linkErr.message });
    }
  }

  // Enroll the student in BOTH their primary class and the class they just
  // joined (one student_classes row per class). Backfilling the primary class
  // covers older self-joined students that only had students.class_id, so the
  // profile shows every class even after we stop creating duplicate records.
  const { data: stuRow } = await admin
    .from('students')
    .select('class_id')
    .eq('id', studentId)
    .maybeSingle();
  if (stuRow?.class_id) await ensureEnrollment(admin, teacherId, studentId, stuRow.class_id);
  await ensureEnrollment(admin, teacherId, studentId, request.class_id);

  // Surface the student's own profile photo on the teacher's record (covers both
  // a freshly-created record and an existing one being linked).
  await applyAccountPhoto(admin, request.student_account_id, studentId);

  await admin
    .from('class_join_requests')
    .update({ status: 'accepted', student_id: studentId, decided_at: new Date().toISOString() })
    .eq('id', request_id);

  return jsonResponse({ ok: true, student_id: studentId });
});
