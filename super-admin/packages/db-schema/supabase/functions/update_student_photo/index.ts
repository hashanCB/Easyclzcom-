// update_student_photo — student sets/clears their real profile photo.
// Auth:   None (public) — identity verified by account_id + phone, same as the
//         cosmetic update_student_avatar function.
// Input:  { account_id, phone, profile_photo: string | null }
//           profile_photo is a downscaled image data URL (data:image/...;base64,…)
//           or null to remove the photo.
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { toLocalLK } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// Cap the stored size so a single account row stays small. The website
// downscales to ~256px before upload, which is well under this.
const MAX_DATA_URL_CHARS = 350_000; // ~260 KB of base64

const Input = z.object({
  account_id:    z.string().uuid(),
  phone:         z.string().min(7).max(20),
  profile_photo: z
    .string()
    .max(MAX_DATA_URL_CHARS)
    .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/, 'Must be an image data URL')
    .nullable(),
});

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse({ code: 'invalid_input', message: 'POST only' });

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { account_id, phone: rawPhone, profile_photo } = parsed.data;
  const phone = toLocalLK(rawPhone);

  const admin = adminClient();

  // Verify identity — stable columns only (mirrors update_student_avatar).
  const { data: account, error: fetchErr } = await admin
    .from('student_accounts')
    .select('id')
    .eq('id', account_id)
    .eq('phone', phone)
    .maybeSingle();

  if (fetchErr || !account) {
    return errorResponse({ code: 'wrong_credentials', message: 'Session invalid. Please sign in again.' });
  }

  const { error: updateErr } = await admin
    .from('student_accounts')
    .update({ profile_photo })
    .eq('id', account_id);

  if (updateErr) {
    return errorResponse({ code: 'server_error', message: updateErr.message });
  }

  // Propagate the photo to every teacher record this account is linked to, so a
  // change shows up on the teacher side (not just at join time). We only touch
  // records that hold a student-provided photo (a data: URL) or none yet — a
  // photo the teacher uploaded themselves (an R2 key) is left alone. Bumping
  // client_updated_at makes the teacher app's offline sync pull the change.
  try {
    const { data: links } = await admin
      .from('student_account_links')
      .select('student_id')
      .eq('student_account_id', account_id);

    const studentIds = (links ?? []).map((l) => l.student_id).filter(Boolean);
    if (studentIds.length > 0) {
      const { data: rows } = await admin
        .from('students')
        .select('id, profile_photo_url')
        .in('id', studentIds);
      // Eligible = no photo yet, or a student-provided one (data: URL). Never
      // clobber a photo the teacher uploaded themselves (an R2 key).
      const eligible = (rows ?? [])
        .filter((r) => !r.profile_photo_url || String(r.profile_photo_url).startsWith('data:'))
        .map((r) => r.id);
      if (eligible.length > 0) {
        const stamp = new Date().toISOString();
        await admin
          .from('students')
          .update({ profile_photo_url: profile_photo, client_updated_at: stamp, updated_at: stamp })
          .in('id', eligible);
      }
    }
  } catch {
    /* best-effort — the account photo is saved regardless */
  }

  return jsonResponse({ ok: true });
});
