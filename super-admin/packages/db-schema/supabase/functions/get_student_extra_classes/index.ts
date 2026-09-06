// get_student_extra_classes — extra classes for a student, with their attendance
// + the fee they owe (only attendees owe; free-card students are free).
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Output: { extra_classes: [...] }
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

function chargeCents(feeMode: string, customFeeCents: number | null, feeType: string | null, studentCustom: number | null, classFee: number): number {
  if (feeMode === 'free') return 0;
  if (feeType === 'free') return 0;           // free card → free for extras too
  if (feeMode === 'monthly') return feeType === 'custom' ? (studentCustom ?? classFee) : classFee;
  if (feeMode === 'custom') return Math.max(0, customFeeCents ?? 0);
  return 0;
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
  if (link && link.is_active === false) return err('access_suspended', 'Your portal access has been suspended.', 403);

  const { data: stu } = await admin
    .from('students').select('id, class_id, fee_type, custom_fee_cents').eq('id', studentId).is('deleted_at', null).maybeSingle();
  if (!stu) return err('not_found', 'Student not found', 404);

  // The classes this student belongs to (primary + enrollments) and their per-class fee.
  const { data: enrolls } = await admin
    .from('student_classes').select('class_id, fee_type, custom_fee_cents')
    .eq('student_id', studentId).is('deleted_at', null);
  const feeByClass = new Map<string, { fee_type: string | null; custom: number | null }>();
  feeByClass.set(stu.class_id, { fee_type: stu.fee_type, custom: stu.custom_fee_cents });
  for (const e of enrolls ?? []) feeByClass.set((e as any).class_id, { fee_type: (e as any).fee_type, custom: (e as any).custom_fee_cents });
  const classIds = [...feeByClass.keys()];
  if (classIds.length === 0) return json({ extra_classes: [] });

  const { data: classes } = await admin.from('classes').select('id, subject, grade, batch, monthly_fee_cents').in('id', classIds);
  const classById = new Map((classes ?? []).map((c: any) => [c.id, c]));

  const { data: extras } = await admin
    .from('extra_classes').select('id, class_id, topic, date, start_time, end_time, location, fee_mode, custom_fee_cents')
    .eq('teacher_id', teacherId).in('class_id', classIds).eq('is_active', true).is('deleted_at', null)
    .order('date', { ascending: false });
  const extraIds = (extras ?? []).map((e: any) => e.id);
  if (extraIds.length === 0) return json({ extra_classes: [] });

  const { data: att } = await admin
    .from('attendance').select('extra_class_id, status').eq('student_id', studentId).in('extra_class_id', extraIds).is('deleted_at', null);
  const statusByExtra = new Map<string, string>();
  for (const a of att ?? []) if ((a as any).extra_class_id) statusByExtra.set((a as any).extra_class_id, (a as any).status);

  const { data: pays } = await admin
    .from('payments').select('extra_class_id, amount_cents').eq('student_id', studentId).in('extra_class_id', extraIds).is('deleted_at', null);
  const paidByExtra = new Map<string, number>();
  for (const p of pays ?? []) {
    const k = (p as any).extra_class_id;
    if (k) paidByExtra.set(k, (paidByExtra.get(k) ?? 0) + ((p as any).amount_cents ?? 0));
  }

  const out = (extras ?? []).map((e: any) => {
    const cls = classById.get(e.class_id);
    const classFee = cls?.monthly_fee_cents ?? 0;
    const fee = feeByClass.get(e.class_id) ?? { fee_type: null, custom: null };
    const charge = chargeCents(e.fee_mode, e.custom_fee_cents, fee.fee_type, fee.custom, classFee);
    const status = statusByExtra.get(e.id) ?? null;
    const present = status === 'present' || status === 'late';
    const paid = paidByExtra.get(e.id) ?? 0;
    return {
      id: e.id,
      topic: e.topic,
      date: e.date,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      class_name: cls ? `${cls.subject} (Grade ${cls.grade})` : '',
      fee_mode: e.fee_mode,
      charge_cents: charge,
      attended: present,
      status,
      paid_cents: paid,
      owed_cents: present ? Math.max(0, charge - paid) : 0,
    };
  });

  return json({ extra_classes: out });
});
