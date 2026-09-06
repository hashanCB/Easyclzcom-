// =============================================================================
// create_assistant — provision an assistant account for a teacher (U31)
// =============================================================================
// Auth:   Teacher JWT (Authorization: Bearer <teacher_access_token>)
// Input:  { name, phone, class_permissions: [{class_id, permission}] }
// Output: { assistant_id, username, password }  ← password shown ONCE
//
// Guards:
//   1. Teacher must have active/trialing Pro subscription.
//   2. Teacher cannot exceed 2 active assistants (enforced by DB trigger +
//      pre-checked here for a friendlier error message).
//   3. Rolls back auth.users creation if the assistants insert fails.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';
import { CreateAssistantInput } from '../_shared/schema.ts';
import { generateAssistantPassword } from '../_shared/random.ts';
import { usernameToAssistantEmail } from '../_shared/hash.ts';

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

  const parsed = CreateAssistantInput.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const { name, phone, class_permissions } = parsed.data;

  // --- Identify calling teacher ---
  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }
  const teacher_id = user.id;

  const admin = adminClient();

  // --- Check Pro subscription ---
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status')
    .eq('teacher_id', teacher_id)
    .maybeSingle();

  if (!sub || !['active', 'trialing'].includes(sub.status)) {
    return errorResponse({ code: 'pro_required', message: 'Assistant accounts require an active Pro subscription.' });
  }

  // --- Pre-check 2-assistant cap ---
  const { count } = await admin
    .from('assistants')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacher_id)
    .is('deleted_at', null);

  if ((count ?? 0) >= 2) {
    return errorResponse({ code: 'cap_reached', message: 'Maximum of 2 assistants per teacher.' });
  }

  // --- Fetch teacher username to build assistant username ---
  const { data: teacher } = await admin
    .from('teachers')
    .select('username')
    .eq('id', teacher_id)
    .maybeSingle();

  if (!teacher) {
    return errorResponse({ code: 'not_found', message: 'Teacher not found' });
  }

  // Build username: asst_{teacherUsername}_{1 or 2}
  const { data: existing } = await admin
    .from('assistants')
    .select('username')
    .eq('teacher_id', teacher_id)
    .is('deleted_at', null);

  const usedSuffixes = new Set((existing ?? []).map((a: { username: string }) => a.username));
  let suffix = 1;
  let username = `asst_${teacher.username}_${suffix}`;
  while (usedSuffixes.has(username) && suffix <= 2) {
    suffix++;
    username = `asst_${teacher.username}_${suffix}`;
  }

  const password = generateAssistantPassword();
  const email = usernameToAssistantEmail(username);

  // --- Create Supabase Auth user ---
  const { data: authData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'assistant', teacher_id },
  });

  if (createErr || !authData?.user) {
    console.error('auth.admin.createUser failed', createErr);
    return errorResponse({ code: 'server_error', message: 'Failed to create assistant account' });
  }

  const assistant_id = authData.user.id;

  // --- Insert assistants row ---
  const { error: insertErr } = await admin.from('assistants').insert({
    id: assistant_id,
    teacher_id,
    name,
    phone,
    username,
    is_active: true,
  });

  if (insertErr) {
    // Roll back auth user so we don't leave orphans
    await admin.auth.admin.deleteUser(assistant_id);
    console.error('assistants insert failed', insertErr);
    if (insertErr.code === 'check_violation') {
      return errorResponse({ code: 'cap_reached', message: 'Maximum of 2 assistants per teacher.' });
    }
    return errorResponse({ code: 'server_error', message: 'Failed to create assistant' });
  }

  // --- Insert class permissions ---
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
      // Non-fatal: assistant created, permissions can be updated via update_assistant
    }
  }

  return jsonResponse({ assistant_id, username, password });
});
