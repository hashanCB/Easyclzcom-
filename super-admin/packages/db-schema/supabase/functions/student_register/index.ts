// student_register — create a global student account (phone + password).
// Auth:   None (public endpoint, no-verify-jwt)
// Input:  { phone, name, password }
// Output: { ok: true }

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { hashStudentPassword } from '../_shared/hash.ts';
import { toLocalLK } from '../_shared/student-otp.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const Input = z.object({
  phone:    z.string().min(7).max(20),
  name:     z.string().min(1).max(120),
  password: z.string().min(6).max(100),
});

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResponse({ code: 'invalid_input', message: 'Body must be JSON' });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return errorResponse({ code: 'invalid_input', message: 'Invalid input', details: parsed.error.flatten() });
  }
  const { phone: rawPhone, name, password } = parsed.data;
  const phone = toLocalLK(rawPhone); // always store in local 07... format

  const admin = adminClient();

  const { data: existing } = await admin
    .from('student_accounts')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    return errorResponse({ code: 'conflict', message: 'An account with this phone number already exists.' });
  }

  const password_hash = await hashStudentPassword(password);

  const { error } = await admin.from('student_accounts').insert({ phone, name, password_hash });
  if (error) {
    console.error('register error', error);
    return errorResponse({ code: 'server_error', message: 'Failed to create account' });
  }

  return jsonResponse({ ok: true });
});
