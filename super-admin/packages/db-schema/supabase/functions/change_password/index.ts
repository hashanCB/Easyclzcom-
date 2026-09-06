// =============================================================================
// change_password — teacher self-service (SRS §5.4)
// =============================================================================
// Input:  { current_password, new_password, confirm_password }
// Output: { ok: true }
//
// Flow:
//   1. Verify caller is a teacher (or assistant — assistants reuse this fn).
//   2. Re-verify current password by signing in with it.
//   3. Update password via auth.admin.updateUserById.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { getCaller } from '../_shared/role.ts';
import { adminClient, verifyClient } from '../_shared/supabase.ts';
import { ChangePasswordInput } from '../_shared/schema.ts';
import { usernameToAuthEmail } from '../_shared/hash.ts';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  const caller = await getCaller(req);
  if (!caller) {
    return errorResponse({ code: 'unauthorized', message: 'Sign-in required' });
  }
  if (caller.role !== 'teacher' && caller.role !== 'assistant') {
    return errorResponse({ code: 'forbidden', message: 'Teacher or assistant only' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = ChangePasswordInput.safeParse(body);
  if (!parsed.success) {
    return errorResponse({
      code: 'invalid_input',
      message: 'Invalid input',
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  const admin = adminClient();

  const usernameTable = caller.role === 'teacher' ? 'teachers' : 'assistants';
  const { data: row } = await admin
    .from(usernameTable)
    .select('username')
    .eq('id', caller.user_id)
    .maybeSingle();
  if (!row) {
    return errorResponse({ code: 'not_found', message: 'User row not found' });
  }

  // Re-verify current password (Supabase Auth has no native "verify password"
  // endpoint — signInWithPassword is the canonical check). Uses a throwaway
  // client so the admin client keeps its service-role session.
  const { error: verifyErr } = await verifyClient().auth.signInWithPassword({
    email: usernameToAuthEmail((row.username as string).toLowerCase()),
    password: input.current_password,
  });
  if (verifyErr) {
    return errorResponse({ code: 'wrong_credentials', message: 'Current password is incorrect' });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(caller.user_id, {
    password: input.new_password,
  });
  if (updateErr) {
    return errorResponse({
      code: 'internal',
      message: 'Failed to update password',
      details: updateErr.message,
    });
  }

  return jsonResponse({ ok: true });
});
