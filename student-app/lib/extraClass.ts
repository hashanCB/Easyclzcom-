// Student portal — extra classes for the active enrollment.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\s/g, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s/g, '');

export interface StudentExtraClass {
  id: string;
  topic: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  class_name: string;
  fee_mode: 'free' | 'monthly' | 'custom';
  charge_cents: number;
  attended: boolean;
  status: string | null;
  paid_cents: number;
  owed_cents: number;
}

export async function fetchStudentExtraClasses(token: string): Promise<StudentExtraClass[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get_student_extra_classes`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (data.extra_classes ?? []) as StudentExtraClass[];
}

export function lkr(cents: number): string {
  return `Rs ${Math.round(cents / 100).toLocaleString()}`;
}
