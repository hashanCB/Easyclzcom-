'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  next: z.string().optional(),
});

export type LoginState = {
  error?: string;
  fieldErrors?: { email?: string[]; password?: string[] };
};

/** Decode the user_role claim from the Supabase access token (JWT).
 *  The custom_access_token_hook (U06) injects `user_role` into the JWT
 *  payload — it does NOT appear in user.app_metadata on the client object. */
function getRoleFromToken(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const claims = JSON.parse(decoded) as Record<string, unknown>;
    return (claims['user_role'] as string) ?? null;
  } catch {
    return null;
  }
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next'),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as LoginState['fieldErrors'],
    };
  }

  const { email, password, next } = parsed.data;
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return { error: 'Invalid email or password.' };
  }

  // Read role from the JWT claims (set by custom_access_token_hook in U06)
  const userRole = getRoleFromToken(data.session.access_token);

  if (userRole !== 'super_admin') {
    await supabase.auth.signOut();
    return { error: 'Access denied. Super admin accounts only.' };
  }

  // Only honour `next` when it points at a real admin route — otherwise a
  // stale/typo'd param (e.g. ?next=/l) would 404 right after a good login.
  const ADMIN_ROUTES = [
    '/dashboard', '/teachers', '/student-accounts', '/funnel',
    '/subscriptions', '/monitoring', '/alerts', '/audit', '/settings',
  ];
  const isValidNext =
    !!next && next.startsWith('/') &&
    ADMIN_ROUTES.some((r) => next === r || next.startsWith(`${r}/`));
  redirect(isValidNext ? next : '/dashboard');
}

export async function logoutAction(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
