'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SUPABASE_URL } from '@/lib/supabase/env';

function usernameToAuthEmail(username: string): string {
  return `${username.toLowerCase()}@teachers.local`;
}

export interface CreateTeacherResult {
  error?: string;
  credentials?: {
    teacher_id: string;
    username: string;
    password: string;
    token: string;
  };
}

export async function createTeacherAction(
  _prev: CreateTeacherResult,
  formData: FormData,
): Promise<CreateTeacherResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const body = {
    username: (formData.get('username') as string | null)?.trim() ?? '',
    phone: (formData.get('phone') as string | null)?.trim() ?? '',
    name: (formData.get('name') as string | null)?.trim() || undefined,
    email: (formData.get('email') as string | null)?.trim() || undefined,
  };

  if (!body.username || !body.phone) {
    return { error: 'Username and phone are required.' };
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create_teacher`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    return { error: json?.error?.message ?? 'Failed to create teacher.' };
  }

  revalidatePath('/teachers');

  return {
    credentials: {
      teacher_id: json.teacher_id,
      username: json.username,
      password: json.password,
      token: json.token,
    },
  };
}

export async function setTeacherActiveAction(teacherId: string, active: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('teachers')
    .update({ is_active: active })
    .eq('id', teacherId);

  if (error) throw new Error(error.message);

  revalidatePath('/teachers');
  revalidatePath(`/teachers/${teacherId}`);
}

export async function bulkSuspendTeachersAction(teacherIds: string[]): Promise<void> {
  if (!teacherIds.length) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from('teachers')
    .update({ is_active: false })
    .in('id', teacherIds);

  if (error) throw new Error(error.message);
  revalidatePath('/teachers');
}

export interface SubscriptionOverrideResult {
  error?: string;
}

export async function grantProFreeAction(
  teacherId: string,
  reason: string,
  months = 12,
): Promise<SubscriptionOverrideResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from('subscriptions')
    .upsert(
      {
        teacher_id: teacherId,
        status: 'active',
        plan_code: 'pro_override',
        current_period_start: now,
        current_period_end: periodEnd,
        cancelled_at: null,
        cancel_at_period_end: false,
        override_reason: reason || 'Manual grant by super admin',
      },
      { onConflict: 'teacher_id' },
    );

  if (error) return { error: error.message };

  revalidatePath(`/teachers/${teacherId}`);
  return {};
}

export async function extendTrialAction(
  teacherId: string,
  days: number,
): Promise<SubscriptionOverrideResult> {
  const admin = createAdminClient();

  const { data: sub, error: fetchErr } = await admin
    .from('subscriptions')
    .select('current_period_end, plan_code')
    .eq('teacher_id', teacherId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };

  const base = sub?.current_period_end ? new Date(sub.current_period_end) : new Date();
  const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from('subscriptions')
    .upsert(
      {
        teacher_id: teacherId,
        status: 'trialing',
        // Keep the package the teacher trialed on; default new rows to Growth.
        plan_code: sub?.plan_code ?? 'growth',
        current_period_end: newEnd,
        override_reason: `Trial extended by ${days}d by super admin`,
      },
      { onConflict: 'teacher_id' },
    );

  if (error) return { error: error.message };

  revalidatePath(`/teachers/${teacherId}`);
  return {};
}

export async function revokeProAction(
  teacherId: string,
  reason: string,
): Promise<SubscriptionOverrideResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('subscriptions')
    .upsert(
      {
        teacher_id: teacherId,
        status: 'cancelled',
        cancelled_at: now,
        cancel_at_period_end: false,
        current_period_end: now,
        override_reason: reason || 'Manual revoke by super admin',
      },
      { onConflict: 'teacher_id' },
    );

  if (error) return { error: error.message };

  revalidatePath(`/teachers/${teacherId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Reset teacher password — super admin generates a new password (shown once)
// ---------------------------------------------------------------------------

export interface ResetTeacherPasswordResult {
  error?: string;
  credentials?: {
    username: string;
    password: string;
  };
}

export async function resetTeacherPasswordAction(
  teacherId: string,
): Promise<ResetTeacherPasswordResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/reset_teacher_password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ teacher_id: teacherId }),
  });

  const json = await res.json();

  if (!res.ok) {
    return { error: json?.error?.message ?? 'Failed to reset password.' };
  }

  revalidatePath(`/teachers/${teacherId}`);

  return {
    credentials: {
      username: json.username,
      password: json.password,
    },
  };
}

// ---------------------------------------------------------------------------
// Force sign-out — super admin signs the teacher out of all devices.
// No token is issued: the teacher logs back in with username + password and the
// auto-evict flow (§5.8) re-binds the new phone. Emergency lever for lost/stolen
// phones; pair with Reset Password when the password may be compromised.
// ---------------------------------------------------------------------------

export interface ResetTeacherDeviceResult {
  error?: string;
  ok?: boolean;
  username?: string;
}

export async function resetTeacherDeviceAction(
  teacherId: string,
): Promise<ResetTeacherDeviceResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/reset_teacher_device`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ teacher_id: teacherId }),
  });

  const json = await res.json();

  if (!res.ok) {
    return { error: json?.error?.message ?? 'Failed to sign out devices.' };
  }

  revalidatePath(`/teachers/${teacherId}`);

  return { ok: true, username: json.username };
}

export async function impersonateTeacherAction(
  teacherId: string,
): Promise<{ url?: string; error?: string }> {
  const admin = createAdminClient();

  const { data: teacher, error: fetchErr } = await admin
    .from('teachers')
    .select('username')
    .eq('id', teacherId)
    .single();

  if (fetchErr || !teacher) return { error: 'Teacher not found' };

  const authEmail = usernameToAuthEmail(teacher.username);

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authEmail,
  });

  if (error) return { error: error.message };

  return { url: data.properties?.action_link ?? undefined };
}
