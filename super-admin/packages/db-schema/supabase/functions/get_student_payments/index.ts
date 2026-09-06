// get_student_payments — return payment history for a student.
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Input:  none (student + teacher resolved from JWT)
// Output: { payments: Payment[] }
//
// Returns all non-deleted payment rows for this student_id ordered by month desc.
// Amount totals are NOT returned — only status per month (SRS §17.3).

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

  // Fetch payments — status only, no amount totals (SRS §17.3)
  const { data: payments, error: payErr } = await admin
    .from('payments')
    .select('id, month, status, collected_at')
    .eq('student_id', studentId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .order('month', { ascending: false });

  if (payErr) return err('server_error', payErr.message, 500);

  return json({ payments: payments ?? [] });
});
