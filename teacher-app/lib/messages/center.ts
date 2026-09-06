// Message Center data layer (U36) — reads the cloud `messages` table and
// supports resending failed messages via the send_sms edge function.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { sendSms } from './sms';
import type { TemplateType } from './templates';

export type MessageTab = 'scheduled' | 'reminders' | 'receipts' | 'custom' | 'sent' | 'failed';

export const MESSAGE_TABS: { key: MessageTab; label: string; icon: string }[] = [
  { key: 'scheduled', label: 'Scheduled', icon: 'time-outline' },
  { key: 'reminders', label: 'Reminders', icon: 'card-outline' },
  { key: 'receipts', label: 'Receipts', icon: 'receipt-outline' },
  { key: 'custom', label: 'Custom', icon: 'megaphone-outline' },
  { key: 'sent', label: 'Sent', icon: 'checkmark-done-outline' },
  { key: 'failed', label: 'Failed', icon: 'alert-circle-outline' },
];

export interface MessageRow {
  id: string;
  type: string;
  channel: string;
  status: string;
  recipient_phone: string;
  body: string;
  student_id: string | null;
  class_id: string | null;
  created_at: string;
  sent_at: string | null;
  scheduled_at: string | null;
  failed_at: string | null;
  error: string | null;
  cost_cents: number | null;
  retry_count: number;
  classes: { grade: string; batch: string; subject: string; language: string } | null;
  students: { name: string } | null;
}

export interface MessageFilters {
  month?: string;     // YYYY-MM
  classId?: string;
  grade?: string;
  batch?: string;
  subject?: string;
  language?: string;
}

function tabQuery(tab: MessageTab): string {
  switch (tab) {
    case 'scheduled': return '&status=eq.queued';
    case 'reminders': return '&type=eq.payment_reminder';
    case 'receipts':  return '&type=eq.payment_received';
    case 'custom':    return '&type=eq.custom';
    case 'sent':      return '&status=in.(sent,delivered)';
    case 'failed':    return '&status=eq.failed';
  }
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01T00:00:00`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00`;
  return { start, end };
}

export async function fetchMessages(
  teacherId: string,
  token: string,
  tab: MessageTab,
  filters: MessageFilters,
): Promise<MessageRow[]> {
  if (!teacherId || !token) return [];

  let url =
    `${SUPABASE_URL}/rest/v1/messages?teacher_id=eq.${teacherId}` +
    `&select=id,type,channel,status,recipient_phone,body,student_id,class_id,created_at,sent_at,scheduled_at,failed_at,error,cost_cents,retry_count,classes(grade,batch,subject,language),students(name)` +
    `&deleted_at=is.null&order=created_at.desc&limit=300`;

  url += tabQuery(tab);

  if (filters.month) {
    const { start, end } = monthRange(filters.month);
    url += `&created_at=gte.${start}&created_at=lt.${end}`;
  }
  if (filters.classId) {
    url += `&class_id=eq.${filters.classId}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const rows: MessageRow[] = await res.json().catch(() => []);

  // Class-attribute filters applied client-side via the embedded class row.
  return rows.filter((r) => {
    if (filters.grade && r.classes?.grade !== filters.grade) return false;
    if (filters.batch && r.classes?.batch !== filters.batch) return false;
    if (filters.subject && r.classes?.subject !== filters.subject) return false;
    if (filters.language && r.classes?.language !== filters.language) return false;
    return true;
  });
}

// Resend a failed message — dispatches a fresh send via send_sms, which logs
// a new `messages` row. The original failed row is left as the audit record.
export async function resendMessage(msg: MessageRow, token: string): Promise<void> {
  await sendSms(
    (msg.type as TemplateType) ?? 'custom',
    [{
      recipient_phone: msg.recipient_phone,
      body: msg.body,
      student_id: msg.student_id ?? undefined,
      class_id: msg.class_id ?? undefined,
    }],
    token,
  );
}
