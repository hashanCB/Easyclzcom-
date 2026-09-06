'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { SUPABASE_URL } from '@/lib/supabase/env';

export interface ResendSmsResult {
  error?: string;
  status?: 'sent' | 'failed';
}

/** Super-admin manual re-send of a single failed/queued SMS. */
export async function resendSmsAction(messageId: string): Promise<ResendSmsResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin_resend_sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ message_id: messageId }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    return { error: json?.error?.message ?? 'Failed to resend SMS.' };
  }

  // Refresh the monitoring view so the new status shows.
  revalidatePath('/monitoring');

  if (json?.status === 'failed') {
    return { status: 'failed', error: json?.error ?? 'SMS delivery failed again.' };
  }
  return { status: 'sent' };
}

export interface ResendAllResult {
  error?: string;
  sent?: number;
  failed?: number;
}

/**
 * Re-send many SMS in one go (e.g. "Resend all failed"). Runs sequentially to
 * avoid hammering the provider, and tolerates individual failures.
 */
export async function resendAllSmsAction(messageIds: string[]): Promise<ResendAllResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };
  if (messageIds.length === 0) return { sent: 0, failed: 0 };

  // Safety cap so one click can't fire thousands of sends.
  const MAX = 500;
  const ids = messageIds.slice(0, MAX);

  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin_resend_sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message_id: id }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.status === 'sent') sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath('/monitoring');
  return { sent, failed };
}
