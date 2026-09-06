// log_exam_event — record an anti-cheat event (e.g. the student left the screen).
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Input:  { attempt_id, type }   type e.g. 'focus_lost'
// Output: { ok: true, focus_lost_count }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://esm.sh/jose@5.2.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(code: string, message: string, status = 400) {
  return json({ error: { code, message } }, status);
}

const ALLOWED = new Set(['focus_lost', 'focus_returned', 'fullscreen_exit']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return err('invalid_input', 'POST only');

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return err('unauthorized', 'Missing token', 401);
  const jwtSecret = Deno.env.get('STUDENT_JWT_SECRET');
  if (!jwtSecret) return err('server_error', 'Server configuration error', 500);

  let studentId: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    studentId = payload.sub as string;
  } catch {
    return err('unauthorized', 'Invalid or expired token', 401);
  }

  const body = await req.json().catch(() => ({}));
  const attemptId = String(body.attempt_id ?? '');
  const type = String(body.type ?? '');
  if (!attemptId || !ALLOWED.has(type)) return err('invalid_input', 'Bad event.');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: attempt } = await admin
    .from('online_exam_attempts').select('id, student_id, status, focus_lost_count')
    .eq('id', attemptId).maybeSingle();
  if (!attempt || attempt.student_id !== studentId) return err('not_found', 'Attempt not found.', 404);

  await admin.from('online_exam_events').insert({ attempt_id: attemptId, type });

  let count = attempt.focus_lost_count ?? 0;
  if (type === 'focus_lost' && attempt.status === 'in_progress') {
    count += 1;
    await admin.from('online_exam_attempts').update({ focus_lost_count: count }).eq('id', attemptId);
  }

  return json({ ok: true, focus_lost_count: count });
});
