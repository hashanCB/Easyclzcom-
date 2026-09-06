// =============================================================================
// log_audit — append-only audit writer for client-reported actions (U44, §24.4)
// =============================================================================
// DB triggers (migration 20260522120000) already cover the data-mutation
// actions (payment / attendance / student / class / subscription). This
// function covers the actions that only the client knows happened and that
// triggers cannot observe:
//   - backup.create
//   - backup.restore
//   - assistant.login
//
// Only those actions are accepted, so a client cannot forge a 'payment.collect'
// or other sensitive audit row. The caller's identity (user_id, role) comes from
// the verified JWT — never from the request body.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { getCaller } from '../_shared/role.ts';
import { adminClient } from '../_shared/supabase.ts';

// Actions a client is allowed to self-report. Everything else is trigger-only.
const ALLOWED_ACTIONS = new Set(['backup.create', 'backup.restore', 'assistant.login']);

interface Body {
  action?: string;
  entity_type?: string;
  entity_id?: string | null;
  new_value?: unknown;
  old_value?: unknown;
  device_id?: string | null;
  device_info?: unknown;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  const caller = await getCaller(req);
  if (!caller) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: 'invalid_input', message: 'Invalid JSON body' });
  }

  const action = body.action ?? '';
  if (!ALLOWED_ACTIONS.has(action)) {
    return errorResponse({ code: 'invalid_input', message: `Action "${action}" cannot be self-reported` });
  }

  const admin = adminClient();

  // Resolve the teacher this audit row belongs to (audit_logs.teacher_id NOT NULL).
  let teacherId: string | null = null;
  if (caller.role === 'teacher') {
    teacherId = caller.user_id;
  } else if (caller.role === 'assistant') {
    const { data: asst } = await admin
      .from('assistants')
      .select('teacher_id')
      .eq('id', caller.user_id)
      .maybeSingle();
    teacherId = asst?.teacher_id ?? null;
  }

  if (!teacherId) {
    return errorResponse({ code: 'forbidden', message: 'Only teachers and assistants can log this action' });
  }

  const { error } = await admin.from('audit_logs').insert({
    teacher_id: teacherId,
    user_id: caller.user_id,
    user_role: caller.role,
    action,
    entity_type: body.entity_type ?? 'system',
    entity_id: body.entity_id ?? null,
    old_value: body.old_value ?? null,
    new_value: body.new_value ?? null,
    device_id: body.device_id ?? null,
    device_info: body.device_info ?? null,
    occurred_at: new Date().toISOString(),
  });

  if (error) {
    console.error('log_audit insert failed', error);
    return errorResponse({ code: 'server_error', message: 'Failed to write audit log' });
  }

  return jsonResponse({ ok: true });
});
