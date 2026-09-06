// Client wrapper for the send_sms edge function + per-teacher cost summary (U34).
import { FUNCTIONS_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import type { TemplateType } from './templates';
import { logEvent } from '../analytics';

export interface SmsRecipient {
  recipient_phone: string;
  body: string;
  student_id?: string;
  class_id?: string;
}

export interface SendSmsResult {
  sent: number;
  failed: number;
  provider_status: number;
  results: { message_id: string; status: 'sent' | 'failed'; error: string | null }[];
}

export interface SmsCostSummary {
  sent: number;
  failed: number;
  queued: number;
  total_cost_cents: number;
}

export async function sendSms(
  type: TemplateType,
  messages: SmsRecipient[],
  token: string,
): Promise<SendSmsResult> {
  if (!token) throw new Error('Your session has expired. Please log in again.');
  if (messages.length === 0) throw new Error('No recipients to send to.');
  if (messages.length > 20) throw new Error('You can send to at most 20 recipients at once.');

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/send_sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ type, messages }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your internet connection.');
  }

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON */ }

  if (!res.ok) {
    const errObj = (data.error ?? {}) as { code?: string; message?: string };
    // Feature/funnel signal: SMS blocked by Free quota or rate limit.
    logEvent('sms.send_blocked', { code: errObj.code ?? String(res.status), count: messages.length });
    if (res.status === 401) throw new Error('Your session has expired. Please log in again.');
    if (res.status === 404) throw new Error('The send_sms function is not deployed on the server.');
    throw new Error(
      errObj.message ?? `Request failed (${res.status}): ${raw.slice(0, 200) || 'Unknown error'}`,
    );
  }
  const result = data as unknown as SendSmsResult;
  logEvent('sms.send', { type, count: messages.length, sent: result.sent ?? 0, failed: result.failed ?? 0 });
  return result;
}

export async function fetchSmsCostSummary(
  token: string,
  month?: string,
): Promise<SmsCostSummary> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_sms_cost_summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ p_month: month ?? null }),
  });
  if (!res.ok) return { sent: 0, failed: 0, queued: 0, total_cost_cents: 0 };
  return res.json().catch(() => ({ sent: 0, failed: 0, queued: 0, total_cost_cents: 0 }));
}
