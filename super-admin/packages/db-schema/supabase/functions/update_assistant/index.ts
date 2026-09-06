// =============================================================================
// update_assistant — update assistant details / permissions / active state (U31)
// =============================================================================
// Auth:   Teacher JWT (Authorization: Bearer <teacher_access_token>)
// Input:  { assistant_id, name?, phone?, is_active?, class_permissions? }
// Output: { ok: true }
//
// If class_permissions is provided it fully replaces the existing set
// (soft-delete old rows, insert new ones).
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { UpdateAssistantInput } from '../_shared/schema.ts';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  // --- Parse body ---
  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = UpdateAssistantInput.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const { assistant_id, name, phone, is_active, class_permissions } = parsed.data;

  // --- Identify calling teacher ---
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }
  const teacher_id = user.id;

  const admin = adminClient();

  // --- Verify assistant belongs to this teacher ---
  const { data: assistant } = await admin
    .from('assistants')
    .select('id')
    .eq('id', assistant_id)
    .eq('teacher_id', teacher_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!assistant) {
    return errorResponse({ code: 'not_found', message: 'Assistant not found' });
  }

  // --- Update assistants row ---
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await admin
      .from('assistants')
      .update(updates)
      .eq('id', assistant_id)
      .eq('teacher_id', teacher_id);

    if (updateErr) {
      console.error('assistants update failed', updateErr);
      return errorResponse({ code: 'server_error', message: 'Failed to update assistant' });
    }
  }

  // --- Replace class permissions (fully replaces the existing set) ---
  if (class_permissions !== undefined) {
    // Hard-delete existing rows. The unique(assistant_id, class_id) constraint
    // is NOT partial, so a soft-deleted row would block re-inserting the same
    // class on the next save — delete outright instead.
    const { error: delErr } = await admin
      .from('assistant_class_permissions')
      .delete()
      .eq('assistant_id', assistant_id)
      .eq('teacher_id', teacher_id);

    if (delErr) {
      console.error('class permissions delete failed', delErr);
      return errorResponse({ code: 'server_error', message: 'Failed to update class permissions' });
    }

    // Insert new set
    if (class_permissions.length > 0) {
      const permRows = class_permissions.map((cp) => ({
        teacher_id,
        assistant_id,
        class_id: cp.class_id,
        permission: cp.permission ?? null,
        can_add_student: cp.can_add_student ?? false,
      }));
      const { error: permErr } = await admin.from('assistant_class_permissions').insert(permRows);
      if (permErr) {
        console.error('class permissions insert failed', permErr);
        // 23503 = FK violation: the class hasn't synced to the cloud yet.
        if (permErr.code === '23503') {
          return errorResponse({
            code: 'invalid_input',
            message: 'One of the selected classes has not synced to the cloud yet. Open the app home screen to sync, then try again.',
          });
        }
        return errorResponse({ code: 'server_error', message: 'Failed to update class permissions' });
      }
    }
  }

  return jsonResponse({ ok: true });
});
