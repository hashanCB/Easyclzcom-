// Student portal — real payment history from Supabase.

const SUPABASE_URL     = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').replace(/\s/g, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s/g, '');

export interface StudentPayment {
  id: string;
  month: string;       // YYYY-MM
  status: 'paid' | 'partial' | 'unpaid';
  collected_at: string | null;
}

export async function fetchStudentPayments(token: string): Promise<StudentPayment[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get_student_payments`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message ?? 'Failed to load payments');
    (e as Error & { code?: string }).code = data?.error?.code;
    throw e;
  }
  return (data.payments ?? []) as StudentPayment[];
}

/** Format "2026-05" → "May 2026" */
export function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('default', { month: 'long', year: 'numeric' });
}
