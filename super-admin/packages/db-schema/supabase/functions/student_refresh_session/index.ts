// student_refresh_session — re-fetch the latest enrollments for a signed-in account.
// Auth:   None (public) — identity proven by account_id + phone (same as unlink_class).
// Input:  { account_id, phone }
// Output: { account, enrollments: [...] }  (same shape as student_global_login)
//
// The student portal calls this on load so suspension/restore changes made by a
// teacher or admin are reflected without forcing the student to sign in again.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { toLocalLK } from '../_shared/student-otp.ts';
import { SignJWT } from 'https://esm.sh/jose@5.2.4';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  account_id: z.string().uuid(),
  phone:      z.string().min(7).max(20),
});

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse({ code: 'invalid_input', message: 'POST only' });

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) return errorResponse({ code: 'invalid_input', message: 'Invalid input' });
  const { account_id, phone: rawPhone } = parsed.data;
  const phone = toLocalLK(rawPhone);

  const admin = adminClient();

  // Verify account (id + phone must match) and is still usable.
  const { data: account } = await admin
    .from('student_accounts')
    .select('id, name, phone, is_active, deleted_at, avatar_emoji, avatar_color')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (!account || account.deleted_at) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }
  if (!account.is_active) {
    return errorResponse({ code: 'account_locked', message: 'This account has been deactivated. Contact support.' });
  }

  const avatar_emoji = account.avatar_emoji ?? '🎓';
  const avatar_color = account.avatar_color ?? 'blue';
  const accountOut = { id: account.id, name: account.name, phone: account.phone, avatar_emoji, avatar_color };

  const { data: links } = await admin
    .from('student_account_links')
    .select('student_id, teacher_id, is_active')
    .eq('student_account_id', account.id);

  const jwtSecret = Deno.env.get('STUDENT_JWT_SECRET');
  if (!jwtSecret) {
    return errorResponse({ code: 'server_error', message: 'Server configuration error' });
  }
  const secretKey = new TextEncoder().encode(jwtSecret);

  if (!links || links.length === 0) {
    return jsonResponse({ account: accountOut, enrollments: [] });
  }

  const studentIds = links.map((l) => l.student_id);
  const teacherIds = [...new Set(links.map((l) => l.teacher_id))];

  const [{ data: students }, { data: teachers }] = await Promise.all([
    admin.from('students')
      .select('id, name, student_code, grade, subject, is_active, deleted_at, card_version, join_status')
      .in('id', studentIds),
    admin.from('teachers')
      .select('id, username, is_active, deleted_at')
      .in('id', teacherIds),
  ]);

  const studentMap = new Map((students ?? []).map((s) => [s.id, s]));
  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));

  const enrollments = await Promise.all(
    links
      .filter((l) => {
        const s = studentMap.get(l.student_id);
        const t = teacherMap.get(l.teacher_id);
        return s && !s.deleted_at && s.is_active && t && !t.deleted_at && t.is_active;
      })
      .map(async (l) => {
        const s = studentMap.get(l.student_id)!;
        const t = teacherMap.get(l.teacher_id)!;
        const token = await new SignJWT({
          sub: l.student_id,
          student_code: s.student_code,
          teacher_id: l.teacher_id,
          role: 'student',
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
          .sign(secretKey);

        return {
          student_id: l.student_id,
          teacher_id: l.teacher_id,
          teacher_username: t.username,
          student_code: s.student_code,
          name: s.name,
          grade: s.grade,
          subject: s.subject,
          card_version: s.card_version ?? 1,
          portal_active: l.is_active ?? true,
          join_status: s.join_status ?? 'confirmed',
          token,
        };
      }),
  );

  return jsonResponse({ account: accountOut, enrollments });
});
