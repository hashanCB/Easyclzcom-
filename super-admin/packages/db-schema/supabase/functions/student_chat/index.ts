// =============================================================================
// student_chat — student-side chat with their teacher (U37, SRS §15)
// =============================================================================
// Auth:   Student JWT (signed with STUDENT_JWT_SECRET) — deployed --no-verify-jwt.
// Input:  { body?: string }   — when `body` is present, sends that message first
// Output: { thread_id, messages: [{ id, sender_role, body, created_at }] }
//
// The student token is a custom JWT (not a Supabase session), so PostgREST/RLS
// cannot be used directly — all chat DB access happens here via the service
// role. The student can only ever touch their own single thread: the thread is
// keyed by (teacher_id, student_id) taken straight from the verified JWT.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://esm.sh/jose@5.2.4';
import { notifyTeacher } from '../_shared/notify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function err(code: string, message: string, status = 400) {
  return json({ error: { code, message } }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return err('invalid_input', 'POST only');

  // --- Verify student JWT ---
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return err('unauthorized', 'Missing token', 401);

  const jwtSecret = Deno.env.get('STUDENT_JWT_SECRET');
  if (!jwtSecret) return err('server_error', 'Server configuration error', 500);

  let studentId: string;
  let teacherId: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    studentId = payload.sub as string;
    teacherId = payload.teacher_id as string;
  } catch {
    return err('unauthorized', 'Invalid or expired token', 401);
  }
  if (!studentId || !teacherId) return err('unauthorized', 'Malformed token', 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // --- Check portal access is not suspended ---
  const { data: link } = await admin
    .from('student_account_links')
    .select('is_active')
    .eq('student_id', studentId)
    .eq('teacher_id', teacherId)
    .maybeSingle();

  // If the link exists and is explicitly suspended, block all chat operations.
  if (link && link.is_active === false) {
    return err('access_suspended', 'Your portal access for this class has been suspended. Please contact your teacher.', 403);
  }

  // --- Optional outgoing message ---
  let outgoing: string | null = null;
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed.body === 'string' && parsed.body.trim()) {
      outgoing = parsed.body.trim().slice(0, 2000);
    }
  } catch { /* no body — poll only */ }

  // --- Ensure the student's single thread exists ---
  let threadId: string;
  const { data: existing } = await admin
    .from('chat_threads')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (existing) {
    threadId = existing.id;
  } else {
    const { data: created, error: createErr } = await admin
      .from('chat_threads')
      .insert({ teacher_id: teacherId, student_id: studentId })
      .select('id')
      .single();
    if (createErr || !created) {
      console.error('thread create failed', createErr);
      return err('server_error', 'Could not open chat', 500);
    }
    threadId = created.id;
  }

  // --- Send the outgoing message (if any) ---
  if (outgoing) {
    const { error: msgErr } = await admin.from('chat_messages').insert({
      teacher_id: teacherId,
      thread_id: threadId,
      sender_role: 'student',
      sender_id: studentId,
      body: outgoing,
    });
    if (msgErr) {
      console.error('message insert failed', msgErr);
      return err('server_error', 'Could not send message', 500);
    }

    // U45: notify the teacher — in-app feed row + phone push (best-effort,
    // never blocks the reply).
    try {
      const { data: stu } = await admin
        .from('students').select('name').eq('id', studentId).maybeSingle();
      const studentName = (stu?.name as string | undefined) ?? 'A student';
      await notifyTeacher({
        teacherId,
        type: 'chat',
        title: `New message from ${studentName}`,
        body: outgoing!.slice(0, 140),
        data: { thread_id: threadId, student_id: studentId },
      });
    } catch (e) {
      console.error('notify (chat) failed', e);
    }
  }

  // --- Mark teacher→student messages as read for this student ---
  await admin.from('chat_threads').update({ unread_for_student: 0 }).eq('id', threadId);

  // --- Return the conversation ---
  const { data: messages } = await admin
    .from('chat_messages')
    .select('id, sender_role, body, created_at')
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(300);

  return json({ thread_id: threadId, messages: messages ?? [] });
});
