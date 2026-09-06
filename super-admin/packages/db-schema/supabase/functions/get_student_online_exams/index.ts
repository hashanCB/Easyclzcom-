// get_student_online_exams — a student's PUBLISHED online-exam results.
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Output: { exams: [{ exam_id, title, total_marks, score, total, submitted_at }] }
// Only exams whose teacher has published the results are returned.
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
  if (req.method !== 'GET') return err('invalid_input', 'GET only');

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

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: link } = await admin
    .from('student_account_links').select('is_active')
    .eq('student_id', studentId).eq('teacher_id', teacherId).maybeSingle();
  if (link && link.is_active === false) {
    return err('access_suspended', 'Your portal access has been suspended.', 403);
  }

  const { data, error } = await admin
    .from('online_exam_attempts')
    .select('exam_id, score, total, submitted_at, online_exams!inner(title, total_marks, results_published, deleted_at)')
    .eq('student_id', studentId)
    .eq('status', 'submitted')
    .eq('online_exams.results_published', true)
    .is('online_exams.deleted_at', null)
    .order('submitted_at', { ascending: false });

  if (error) return err('server_error', error.message, 500);

  const exams = (data ?? []).map((a: any) => ({
    exam_id: a.exam_id,
    title: a.online_exams?.title ?? 'Exam',
    total_marks: a.online_exams?.total_marks ?? a.total ?? 0,
    score: a.score ?? 0,
    total: a.total ?? a.online_exams?.total_marks ?? 0,
    submitted_at: a.submitted_at,
  }));

  return json({ exams });
});
