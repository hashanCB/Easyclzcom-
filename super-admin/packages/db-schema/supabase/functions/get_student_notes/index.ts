// =============================================================================
// get_student_notes — return notes for the student's class (U30, SRS §16.3)
// =============================================================================
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Input:  none
// Output: { notes: NoteWithFiles[] }
//
// Guards:
//   1. JWT must be valid (signed with STUDENT_JWT_SECRET).
//   2. Returns only notes belonging to the student's own class.
//   3. Teacher must have active Pro subscription.
// =============================================================================

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

  // --- Verify student JWT ---
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

  // --- Check teacher Pro subscription ---
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status')
    .eq('teacher_id', teacherId)
    .maybeSingle();

  if (!sub || !['active', 'trialing'].includes(sub.status)) {
    return err('pro_inactive', 'Note library requires an active Pro subscription.', 403);
  }

  // --- Get student's class_id ---
  const { data: student } = await admin
    .from('students')
    .select('class_id')
    .eq('id', studentId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!student) return err('not_found', 'Student not found', 404);

  // --- Fetch notes for student's class ---
  // Cloud columns: date, is_today_special, link_url (no note_type / note_date).
  const { data: notes, error: notesErr } = await admin
    .from('notes')
    .select('id, title, topic, date, is_today_special, link_url, remark')
    .eq('class_id', student.class_id)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (notesErr) return err('server_error', 'Failed to fetch notes', 500);

  // --- Fetch files for each note ---
  // Cloud column for the R2 object key is `storage_key`.
  const noteIds = (notes ?? []).map((n: { id: string }) => n.id);
  let filesMap: Record<string, { id: string; filename: string; mime_type: string; size_bytes: number | null; r2_key: string }[]> = {};

  if (noteIds.length > 0) {
    const { data: files } = await admin
      .from('note_files')
      .select('id, note_id, filename, mime_type, size_bytes, storage_key')
      .in('note_id', noteIds)
      .is('deleted_at', null);

    for (const f of files ?? []) {
      if (!filesMap[f.note_id]) filesMap[f.note_id] = [];
      filesMap[f.note_id].push({
        id: f.id,
        filename: f.filename,
        mime_type: f.mime_type,
        size_bytes: f.size_bytes,
        r2_key: f.storage_key,
      });
    }
  }

  // Map cloud rows to the shape student-web expects (note_type / note_date).
  const result = (notes ?? []).map((n: { id: string; title: string; topic: string | null; date: string; is_today_special: boolean; link_url: string | null; remark: string | null }) => {
    const note_type = n.is_today_special
      ? 'today'
      : n.link_url
      ? 'link'
      : n.topic
      ? 'topic'
      : 'normal';
    return {
      id: n.id,
      title: n.title,
      topic: n.topic,
      note_type,
      note_date: n.date,
      link_url: n.link_url,
      remark: n.remark,
      files: filesMap[n.id] ?? [],
    };
  });

  return json({ notes: result });
});
