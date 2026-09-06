// =============================================================================
// get_student_file_url — return a presigned R2 download URL for a note file
// =============================================================================
// Auth:   Student JWT (Authorization: Bearer <student_token>)
// Input:  { r2_key: string }
// Output: { url: string }
//
// Guards:
//   1. JWT must be valid (signed with STUDENT_JWT_SECRET).
//   2. r2_key must start with t/<teacher_id>/ (tenant isolation).
//
// R2 credentials are NOT stored here. This function delegates presigning to the
// Cloudflare r2-worker, which is the single owner of the R2 keys. Auth to the
// worker uses INTERNAL_SHARED_SECRET (server-to-server).
//
// Required Supabase secrets:
//   STUDENT_JWT_SECRET, R2_WORKER_URL, INTERNAL_SHARED_SECRET
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
  if (req.method !== 'POST') return err('invalid_input', 'POST only');

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

  // --- Block suspended portal access ---
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: link } = await admin
    .from('student_account_links')
    .select('is_active')
    .eq('student_id', studentId)
    .eq('teacher_id', teacherId)
    .maybeSingle();
  if (link && link.is_active === false) {
    return err('access_suspended', 'Your portal access for this class has been suspended. Please contact your teacher.', 403);
  }

  // --- Parse body ---
  let body: { r2_key?: string };
  try {
    body = await req.json();
  } catch {
    return err('invalid_input', 'Body must be JSON');
  }

  const { r2_key } = body;
  if (!r2_key) return err('invalid_input', 'r2_key is required');

  // --- Tenant isolation check ---
  if (!r2_key.startsWith(`t/${teacherId}/`)) {
    return err('forbidden', 'Access denied', 403);
  }

  // --- Delegate presigning to the r2-worker ---
  const workerUrl = Deno.env.get('R2_WORKER_URL');
  const internalSecret = Deno.env.get('INTERNAL_SHARED_SECRET');
  if (!workerUrl || !internalSecret) {
    return err('server_error', 'R2 worker not configured', 500);
  }

  const res = await fetch(`${workerUrl}/download-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': internalSecret,
      'X-Teacher-Id': teacherId,
    },
    body: JSON.stringify({ key: r2_key }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404) return err('not_found', 'File not found', 404);
    return err('server_error', `R2 worker error (${res.status}): ${text}`, 502);
  }

  const data = (await res.json()) as { url: string };
  return json({ url: data.url });
});
