// =============================================================================
// get_class_by_code — look up class details from a join code.
// =============================================================================
// Auth:   None (public, no-verify-jwt) — the student previews the class before
//         sending a join request.
// Input:  { code }
// Output: { class_id, teacher_username, teacher_name, subject, grade, batch,
//           class_type, language, monthly_fee_cents }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  code: z.string().min(4).max(20),
});

// Codes are shown as 'X4K-2M9' but stored as 'X4K2M9' — strip separators and
// normalise case so students can type them any way they like.
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
  const code = normaliseCode(parsed.data.code);

  const admin = adminClient();

  const { data: cls } = await admin
    .from('classes')
    .select('id, teacher_id, subject, grade, batch, class_type, language, monthly_fee_cents')
    .eq('join_code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (!cls) {
    return errorResponse({ code: 'not_found', message: 'No class found for that code. Check it with your teacher.' });
  }

  const { data: teacher } = await admin
    .from('teachers')
    .select('username, name, education_qualification')
    .eq('id', cls.teacher_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!teacher) {
    return errorResponse({ code: 'not_found', message: 'No class found for that code. Check it with your teacher.' });
  }

  // education_qualification holds a JSON array of qualification lines. Older
  // rows may hold a plain string — treat that as a single entry. Either way the
  // client always receives a clean string[].
  const parseQualifications = (raw: string | null): string[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((q) => String(q).trim()).filter(Boolean);
      }
    } catch { /* not JSON — fall through to plain-string handling */ }
    const s = raw.trim();
    return s ? [s] : [];
  };

  return jsonResponse({
    class_id: cls.id,
    teacher_username: teacher.username,
    teacher_name: teacher.name ?? null,
    teacher_qualifications: parseQualifications(teacher.education_qualification ?? null),
    subject: cls.subject,
    grade: cls.grade,
    batch: cls.batch,
    class_type: cls.class_type,
    language: cls.language,
    monthly_fee_cents: cls.monthly_fee_cents,
  });
});
