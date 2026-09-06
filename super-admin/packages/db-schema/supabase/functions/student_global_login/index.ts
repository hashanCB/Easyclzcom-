// student_global_login — sign in with phone + password, get tokens for all enrolled classes.
// Auth:   None (public endpoint, no-verify-jwt)
// Input:  { phone, password }
// Output: { account, enrollments: [{ teacher_username, student_id, student_code, name, grade, subject, token }] }
//
// Each enrollment token is issued in the same format as student_login so all
// existing student-scoped edge functions work without changes.

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { verifyStudentPassword } from '../_shared/hash.ts';
import { toLocalLK } from '../_shared/student-otp.ts';
import { SignJWT } from 'https://esm.sh/jose@5.2.4';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  phone:    z.string().min(7).max(20),
  password: z.string().min(1),
});

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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
  const { phone: rawPhone, password } = parsed.data;
  const phone = toLocalLK(rawPhone); // normalise +94... → 07... before lookup

  const admin = adminClient();
  const credErr = () => errorResponse({ code: 'wrong_credentials', message: 'Invalid phone number or password' });

  const { data: account } = await admin
    .from('student_accounts')
    .select('id, name, phone, password_hash, is_active, deleted_at')
    .eq('phone', phone)
    .maybeSingle();

  if (!account || account.deleted_at) return credErr();
  if (!account.is_active) {
    return errorResponse({ code: 'account_locked', message: 'This account has been deactivated. Contact support.' });
  }

  const ok = await verifyStudentPassword(password, account.password_hash);
  if (!ok) return credErr();

  // Avatar fields — fetched separately so a schema-cache miss can't block login.
  const { data: av } = await admin
    .from('student_accounts')
    .select('avatar_emoji, avatar_color')
    .eq('id', account.id)
    .maybeSingle();
  const avatar_emoji = av?.avatar_emoji ?? '🎓';
  const avatar_color = av?.avatar_color ?? 'blue';

  // Fetch all linked enrollments — avoid FK join syntax since the FK
  // constraints may not exist yet; do separate queries instead.
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
    return jsonResponse({ account: { id: account.id, name: account.name, phone: account.phone, avatar_emoji, avatar_color }, enrollments: [] });
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

  // Issue one per-enrollment token (existing format) so no other edge functions need changing.
  // Suspended links (is_active = false) are still included so the student portal
  // can show a "suspended" badge — but those tokens can't be used for chat.
  const enrollments = await Promise.all(
    links
      .filter((l) => {
        const s = studentMap.get(l.student_id);
        const t = teacherMap.get(l.teacher_id);
        // Exclude hard-deleted or deactivated students/teachers but keep suspended portal links.
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
          portal_active: l.is_active ?? true,  // false = portal access suspended
          join_status: s.join_status ?? 'confirmed',  // 'pending_payment' = awaiting first payment
          token,
        };
      }),
  );

  return jsonResponse({
    account: { id: account.id, name: account.name, phone: account.phone, avatar_emoji, avatar_color },
    enrollments,
  });
});
