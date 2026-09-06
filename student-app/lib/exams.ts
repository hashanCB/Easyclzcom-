// Student portal — exam results from Supabase.

const SUPABASE_URL      = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').replace(/\s/g, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s/g, '');

export interface StudentExam {
  mark_id:     string;
  exam_id:     string;
  title:       string;
  exam_date:   string | null;   // ISO date "YYYY-MM-DD"
  total_marks: number;
  mark:        number;
  subject:     string;
  grade:       string;
  exam_remark: string | null;
  mark_remark: string | null;
}

export async function fetchStudentExams(token: string): Promise<StudentExam[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get_student_exams`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message ?? 'Failed to load exams');
    (e as Error & { code?: string }).code = data?.error?.code;
    throw e;
  }
  return (data.exams ?? []) as StudentExam[];
}

/** Compute percentage and round to 1 decimal */
export function pct(mark: number, total: number): number {
  if (!total) return 0;
  return Math.round((mark / total) * 1000) / 10;
}

/** "YYYY-MM-DD" → "24 May 2026" */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
}
