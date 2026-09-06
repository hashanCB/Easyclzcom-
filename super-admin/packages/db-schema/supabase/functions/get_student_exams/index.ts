// get_student_exams — return exam results for a student.
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Input:  none (student + teacher resolved from JWT)
// Output: { exams: ExamResult[] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://esm.sh/jose@5.2.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (req.method !== 'GET') return err('invalid_input', 'GET only');

  // Verify student JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // --- Block suspended portal access ---
  const { data: link } = await admin
    .from('student_account_links')
    .select('is_active')
    .eq('student_id', studentId)
    .eq('teacher_id', teacherId)
    .maybeSingle();
  if (link && link.is_active === false) {
    return err('access_suspended', 'Your portal access for this class has been suspended. Please contact your teacher.', 403);
  }

  // Verify student belongs to this teacher and is not deleted
  const { data: student } = await admin
    .from('students')
    .select('id, class_id')
    .eq('id', studentId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!student) return err('not_found', 'Student not found', 404);

  // Fetch marks for this student, joining exam details
  const { data: marks, error: marksErr } = await admin
    .from('marks')
    .select(`
      id,
      mark,
      remark,
      exam_id,
      exams!marks_exam_id_fkey (
        id,
        title,
        exam_date,
        total_marks,
        subject,
        grade,
        remark
      )
    `)
    .eq('student_id', studentId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (marksErr) return err('server_error', marksErr.message, 500);

  // Shape the response
  const exams = (marks ?? []).map((m: any) => {
    const exam = m.exams;
    return {
      mark_id:     m.id,
      exam_id:     m.exam_id,
      title:       exam?.title ?? '',
      exam_date:   exam?.exam_date ?? null,
      total_marks: exam?.total_marks ?? 0,
      mark:        m.mark,
      subject:     exam?.subject ?? '',
      grade:       exam?.grade ?? '',
      exam_remark: exam?.remark ?? null,
      mark_remark: m.remark ?? null,
    };
  });

  return json({ exams });
});
