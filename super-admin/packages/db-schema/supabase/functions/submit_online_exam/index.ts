// submit_online_exam — grade and save a student's answers (server-side grading).
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Input:  { attempt_id, answers: [{ question_id, selected_index }] }
// Output: { score, total }
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
  const answers: { question_id: string; selected_index: number | null }[] = Array.isArray(body.answers) ? body.answers : [];
  if (!attemptId) return err('invalid_input', 'Missing attempt.');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Attempt must belong to this student.
  const { data: attempt } = await admin
    .from('online_exam_attempts').select('id, exam_id, student_id, status, score, total')
    .eq('id', attemptId).maybeSingle();
  if (!attempt || attempt.student_id !== studentId) return err('not_found', 'Attempt not found.', 404);

  // Has the teacher released the marks for this exam yet?
  const { data: examMeta } = await admin
    .from('online_exams').select('results_published, total_marks').eq('id', attempt.exam_id).maybeSingle();
  const published = examMeta?.results_published === true;

  if (attempt.status === 'submitted') {
    return json({
      submitted: true, already: true, published,
      total: attempt.total ?? examMeta?.total_marks ?? 0,
      score: published ? (attempt.score ?? 0) : null,
    });
  }

  // Load the questions with their correct answers (server-side only).
  const { data: qs } = await admin
    .from('online_exam_questions').select('id, correct_index, marks').eq('exam_id', attempt.exam_id);
  const byId = new Map<string, { correct_index: number; marks: number }>();
  let total = 0;
  for (const q of qs ?? []) { byId.set((q as any).id, { correct_index: (q as any).correct_index, marks: (q as any).marks }); total += (q as any).marks; }

  // Grade.
  const selectedByQ = new Map<string, number | null>();
  for (const a of answers) selectedByQ.set(String(a.question_id), a.selected_index == null ? null : Number(a.selected_index));

  let score = 0;
  const rows = [] as { attempt_id: string; question_id: string; selected_index: number | null; is_correct: boolean }[];
  for (const [qid, q] of byId) {
    const sel = selectedByQ.has(qid) ? selectedByQ.get(qid)! : null;
    const correct = sel != null && sel === q.correct_index;
    if (correct) score += q.marks;
    rows.push({ attempt_id: attemptId, question_id: qid, selected_index: sel, is_correct: correct });
  }

  // Save answers (replace any existing) then finalize the attempt.
  await admin.from('online_exam_answers').delete().eq('attempt_id', attemptId);
  if (rows.length > 0) await admin.from('online_exam_answers').insert(rows);

  const { error: upErr } = await admin
    .from('online_exam_attempts')
    .update({ status: 'submitted', score, total, submitted_at: new Date().toISOString() })
    .eq('id', attemptId);
  if (upErr) return err('server_error', upErr.message, 500);

  // Reveal the score only once the teacher publishes results.
  return json({ submitted: true, published, total, score: published ? score : null });
});
