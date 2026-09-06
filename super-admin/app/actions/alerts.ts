'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface SystemAlert {
  id: number;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: Record<string, unknown>;
  notified: boolean;
  created_at: string;
  resolved_at: string | null;
}

export async function getSystemAlerts(): Promise<SystemAlert[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('system_alerts')
    .select('id, kind, severity, message, details, notified, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as SystemAlert[];
}

export async function getUnresolvedAlertCount(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from('system_alerts')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null);
  return count ?? 0;
}

export async function resolveAlertAction(id: number): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('system_alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/alerts');
  return { ok: true };
}

export async function resolveAllAlertsAction(): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('system_alerts')
    .update({ resolved_at: new Date().toISOString() })
    .is('resolved_at', null);
  if (error) return { error: error.message };
  revalidatePath('/alerts');
  return { ok: true };
}
