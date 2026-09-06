// =============================================================================
// reset_assistant_password — teacher resets a forgotten assistant PIN (U31+)
// =============================================================================
// Auth:   Teacher JWT (Authorization: Bearer <teacher_access_token>)
// Input:  { assistant_id }
// Output: { username, password }  ← new 8-digit password, shown ONCE
//
// Guards: the assistant must belong to the calling teacher and not be deleted.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { generateAssistantPassword } from '../_shared/random.ts';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  let body: { assistant_id?: string };
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }
  const assistantId = body.assistant_id;
  if (!assistantId) {
    return errorResponse({ code: 'invalid_input', message: 'assistant_id is required' });
  }

  // --- Identify calling teacher ---
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }
  const teacher_id = user.id;

  const admin = adminClient();

  // --- Verify the assistant belongs to this teacher ---
  const { data: assistant } = await admin
    .from('assistants')
    .select('id, username, teacher_id, deleted_at')
    .eq('id', assistantId)
    .maybeSingle();

  if (!assistant || assistant.teacher_id !== teacher_id || assistant.deleted_at) {
    return errorResponse({ code: 'not_found', message: 'Assistant not found' });
  }

  // --- Generate + apply the new password ---
  const password = generateAssistantPassword();
  const { error: updateErr } = await admin.auth.admin.updateUserById(assistantId, { password });
  if (updateErr) {
    console.error('reset assistant password failed', updateErr);
    return errorResponse({ code: 'server_error', message: 'Failed to reset password' });
  }

  // --- Audit (best-effort, append-only) ---
  await admin.from('audit_logs').insert({
    teacher_id,
    user_id: teacher_id,
    user_role: 'teacher',
    action: 'assistant.password_reset',
    entity_type: 'assistant',
    entity_id: assistantId,
    new_value: { event: 'password_reset' },
    occurred_at: new Date().toISOString(),
  }).then(undefined, (e: unknown) => console.error('audit insert failed', e));

  return jsonResponse({ username: assistant.username, password });
});
