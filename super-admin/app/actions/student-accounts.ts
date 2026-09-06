'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

// Shared PBKDF2 password hashing — must match the edge function implementation.
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LEN = 32;

function hexEncode(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashStudentPassword(plain: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    PBKDF2_KEY_LEN * 8,
  );
  return `pbkdf2$${hexEncode(salt.buffer)}$${hexEncode(derived)}`;
}

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join('');
}

export async function setStudentAccountActiveAction(id: string, active: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('student_accounts')
    .update({ is_active: active })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  revalidatePath('/student-accounts');
  revalidatePath(`/student-accounts/${id}`);
}

export async function deleteStudentAccountAction(id: string): Promise<void> {
  const admin = createAdminClient();
  // Soft-delete: set deleted_at and deactivate.
  const { error } = await admin
    .from('student_accounts')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/student-accounts');
  revalidatePath(`/student-accounts/${id}`);
}

export async function unlinkStudentEnrollmentAction(student_account_id: string, student_id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('student_account_links')
    .delete()
    .eq('student_account_id', student_account_id)
    .eq('student_id', student_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/student-accounts/${student_account_id}`);
}

export async function restoreStudentAccountAction(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('student_accounts')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/student-accounts');
  revalidatePath(`/student-accounts/${id}`);
}

export interface ResetStudentPasswordResult {
  error?: string;
  newPassword?: string;
}

export async function resetStudentPasswordAction(id: string): Promise<ResetStudentPasswordResult> {
  const admin = createAdminClient();
  const newPassword = generatePassword();
  const password_hash = await hashStudentPassword(newPassword);
  const { error } = await admin
    .from('student_accounts')
    .update({ password_hash })
    .eq('id', id);
  if (error) return { error: error.message };
  return { newPassword };
}

export async function setStudentPasswordAction(id: string, password: string): Promise<ResetStudentPasswordResult> {
  if (!password || password.length < 6) return { error: 'Password must be at least 6 characters.' };
  const admin = createAdminClient();
  const password_hash = await hashStudentPassword(password);
  const { error } = await admin
    .from('student_accounts')
    .update({ password_hash })
    .eq('id', id);
  if (error) return { error: error.message };
  return { newPassword: password };
}

export async function setStudentLinkActiveAction(
  student_account_id: string,
  student_id: string,
  is_active: boolean,
): Promise<{ error?: string; ok?: boolean }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('student_account_links')
    .update({ is_active })
    .eq('student_account_id', student_account_id)
    .eq('student_id', student_id);
  if (error) return { error: error.message };
  revalidatePath(`/student-accounts/${student_account_id}`);
  return { ok: true };
}

export async function grantExtraChangesAction(
  id: string,
  type: 'phone' | 'password',
): Promise<{ error?: string; ok?: boolean }> {
  const admin = createAdminClient();
  const update = type === 'phone'
    ? { phone_change_count: 0 }
    : { pw_change_count: 0 };
  const { error } = await admin
    .from('student_accounts')
    .update(update)
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(`/student-accounts/${id}`);
  return { ok: true };
}
