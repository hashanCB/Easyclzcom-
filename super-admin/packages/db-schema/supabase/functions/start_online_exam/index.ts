// start_online_exam — a student enters a join code to start (or resume) an exam.
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Input:  { join_code }
// Output: { attempt_id, title, duration_minutes, total_marks, remaining_seconds,
//           status, score, questions:[{id,position,question_type,question_text,options[],marks}],
//           saved_answers:{ [question_id]: selected_index } }
//
// Correct answers are NEVER returned to the client.
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
  let teacherId: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    studentId = payload.sub as string;
    teacherId = payload.teacher_id as string;
  } catch {
    return err('unauthorized', 'Invalid or expired token', 401);
  }

  const body = await req.json().catch(() => ({}));
  const joinCode = String(body.join_code ?? '').trim().toUpperCase();
  if (!joinCode) return err('invalid_input', 'Enter the exam code.');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Portal suspension check.
  const { data: link } = await admin
    .from('student_account_links').select('is_active')
    .eq('student_id', studentId).eq('teacher_id', teacherId).maybeSingle();
  if (link && link.is_active === false) {
    return err('access_suspended', 'Your portal access has been suspended.', 403);
  }

  // Find the exam.
  const { data: exam } = await admin
    .from('online_exams')
    .select('id, teacher_id, class_id, title, duration_minutes, total_marks, status, results_published')
    .eq('join_code', joinCode).is('deleted_at', null).maybeSingle();
  if (!exam) return err('not_found', 'No exam found for that code.', 404);
  if (exam.teacher_id !== teacherId) return err('not_found', 'This code is not for your class.', 404);
  if (exam.status !== 'published') return err('closed', 'This exam is not open.', 403);

  // Student must belong to the exam's class (primary class or an enrollment).
  const { data: stu } = await admin
    .from('students').select('id, class_id').eq('id', studentId).is('deleted_at', null).maybeSingle();
  let inClass = !!stu && stu.class_id === exam.class_id;
  if (!inClass) {
    const { data: sc } = await admin
      .from('student_classes').select('id')
      .eq('student_id', studentId).eq('class_id', exam.class_id).is('deleted_at', null).maybeSingle();
    inClass = !!sc;
  }
  if (!inClass) return err('not_in_class', 'You are not in the class for this exam.', 403);

  // Existing attempt?
  const { data: existing } = await admin
    .from('online_exam_attempts')
    .select('id, status, started_at, score, total')
    .eq('exam_id', exam.id).eq('student_id', studentId).maybeSingle();

  if (existing && existing.status === 'submitted') {
    // Already finished. Show their marks if the teacher has published results;
    // otherwise tell them to wait.
    if (exam.results_published) {
      return json({
        status: 'result',
        title: exam.title,
        total_marks: exam.total_marks,
        score: existing.score ?? 0,
        total: existing.total ?? exam.total_marks,
      });
    }
    return err('already_done', 'You have finished this exam. Your marks will appear once your teacher publishes the results.', 409);
  }

  let attemptId: string;
  let startedAt: string;
  if (existing) {
    attemptId = existing.id;
    startedAt = existing.started_at;
  } else {
    const { data: created, error: insErr } = await admin
      .from('online_exam_attempts')
      .insert({ exam_id: exam.id, student_id: studentId, teacher_id: teacherId, status: 'in_progress' })
      .select('id, started_at').single();
    if (insErr || !created) return err('server_error', insErr?.message ?? 'Could not start the exam.', 500);
    attemptId = created.id;
    startedAt = created.started_at;
  }

  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const remaining = Math.max(0, exam.duration_minutes * 60 - elapsed);

  // Questions WITHOUT the correct answer.
  const { data: qs } = await admin
    .from('online_exam_questions')
    .select('id, position, question_type, question_text, options, marks, question_image, option_images')
    .eq('exam_id', exam.id).order('position', { ascending: true });

  const questions = (qs ?? []).map((q: any) => {
    let opts: string[] = [];
    try { const p = JSON.parse(q.options); if (Array.isArray(p)) opts = p.map(String); } catch { /* ignore */ }
    let optImgs: (string | null)[] = [];
    try { const p = JSON.parse(q.option_images ?? '[]'); if (Array.isArray(p)) optImgs = p.map((x: unknown) => (x ? String(x) : null)); } catch { /* ignore */ }
    return {
      id: q.id, position: q.position, question_type: q.question_type,
      question_text: q.question_text, options: opts, marks: q.marks,
      question_image: q.question_image ?? null, option_images: optImgs,
    };
  });

  // Any answers already saved (resume case).
  const { data: prev } = await admin
    .from('online_exam_answers').select('question_id, selected_index').eq('attempt_id', attemptId);
  const savedAnswers: Record<string, number | null> = {};
  for (const a of prev ?? []) savedAnswers[(a as any).question_id] = (a as any).selected_index;

  return json({
    attempt_id: attemptId,
    title: exam.title,
    duration_minutes: exam.duration_minutes,
    total_marks: exam.total_marks,
    remaining_seconds: remaining,
    status: 'in_progress',
    questions,
    saved_answers: savedAnswers,
  });
});
