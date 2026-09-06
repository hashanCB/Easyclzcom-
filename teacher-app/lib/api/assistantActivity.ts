// Teacher-side activity report for one assistant over a date range: how much cash
// they collected (confirmed / still pending / flagged), how many students they
// registered, and how much attendance they marked. All read directly over REST
// under the teacher's own RLS (they own every row addressed to them).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

export interface AssistantActivity {
  cashConfirmedCents: number;
  cashPendingCents: number;
  cashRejectedCents: number;
  cashConfirmedCount: number;
  cashPendingCount: number;
  studentsAdded: number;
  attendanceTotal: number;
  attendancePresent: number;
  attendanceLate: number;
  attendanceAbsent: number;
}

const EMPTY: AssistantActivity = {
  cashConfirmedCents: 0, cashPendingCents: 0, cashRejectedCents: 0,
  cashConfirmedCount: 0, cashPendingCount: 0,
  studentsAdded: 0,
  attendanceTotal: 0, attendancePresent: 0, attendanceLate: 0, attendanceAbsent: 0,
};

// fromDate/toDate are YYYY-MM-DD (inclusive). Pass null for "all time".
export async function fetchAssistantActivity(
  assistantId: string,
  token: string,
  fromDate: string | null,
  toDate: string | null,
): Promise<AssistantActivity> {
  if (!assistantId || !token) return EMPTY;
  const h = { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' };

  // Timestamp columns (collected_at / created_at) bound the whole day; the date
  // column (attendance.date) compares directly.
  const tsFrom = fromDate ? `&collected_at=gte.${fromDate}T00:00:00` : '';
  const tsTo = toDate ? `&collected_at=lte.${toDate}T23:59:59` : '';
  const subFrom = fromDate ? `&created_at=gte.${fromDate}T00:00:00` : '';
  const subTo = toDate ? `&created_at=lte.${toDate}T23:59:59` : '';
  const dFrom = fromDate ? `&date=gte.${fromDate}` : '';
  const dTo = toDate ? `&date=lte.${toDate}` : '';

  try {
    const [collRes, subRes, attRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/payment_collections?created_by_assistant_id=eq.${assistantId}${tsFrom}${tsTo}&select=status,amount_cents`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/students?created_by_assistant_id=eq.${assistantId}&deleted_at=is.null${subFrom}${subTo}&select=id`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/attendance?marked_by_user_id=eq.${assistantId}&deleted_at=is.null${dFrom}${dTo}&select=status`, { headers: h }),
    ]);
    const coll = (await collRes.json().catch(() => [])) as { status: string; amount_cents: number }[];
    const subs = (await subRes.json().catch(() => [])) as { id: string }[];
    const att = (await attRes.json().catch(() => [])) as { status: string }[];

    const out: AssistantActivity = { ...EMPTY };
    if (Array.isArray(coll)) {
      for (const c of coll) {
        if (c.status === 'confirmed') { out.cashConfirmedCents += c.amount_cents; out.cashConfirmedCount += 1; }
        else if (c.status === 'pending') { out.cashPendingCents += c.amount_cents; out.cashPendingCount += 1; }
        else if (c.status === 'rejected') { out.cashRejectedCents += c.amount_cents; }
      }
    }
    if (Array.isArray(subs)) {
      out.studentsAdded = subs.length;
    }
    if (Array.isArray(att)) {
      out.attendanceTotal = att.length;
      out.attendancePresent = att.filter((a) => a.status === 'present').length;
      out.attendanceLate = att.filter((a) => a.status === 'late').length;
      out.attendanceAbsent = att.filter((a) => a.status === 'absent').length;
    }
    return out;
  } catch {
    return EMPTY;
  }
}
