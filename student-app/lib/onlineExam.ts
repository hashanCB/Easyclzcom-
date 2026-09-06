// Student portal — online exam: start, submit, and anti-cheat event logging.
// All calls go through edge functions using the per-enrollment student token.

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\s/g, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s/g, '');

export interface ExamQuestion {
  id: string;
  position: number;
  question_type: string;
  question_text: string;
  options: string[];
  marks: number;
  question_image?: string | null;        // R2 key
  option_images?: (string | null)[];     // R2 key per option
}

export interface StartExamResult {
  // status 'in_progress' = take the exam; 'result' = already done + results published
  status: string;
  title: string;
  // present when status === 'in_progress'
  attempt_id?: string;
  duration_minutes?: number;
  total_marks?: number;
  remaining_seconds?: number;
  questions?: ExamQuestion[];
  saved_answers?: Record<string, number | null>;
  // present when status === 'result'
  score?: number;
  total?: number;
}

export class ExamError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ExamError';
  }
}

async function callFn(name: string, token: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ExamError(data?.error?.code ?? 'error', data?.error?.message ?? 'Something went wrong.');
  }
  return data;
}

export function startExam(token: string, joinCode: string): Promise<StartExamResult> {
  return callFn('start_online_exam', token, { join_code: joinCode });
}

export function submitExam(
  token: string,
  attemptId: string,
  answers: { question_id: string; selected_index: number | null }[],
): Promise<{ submitted: boolean; published: boolean; total: number; score: number | null; already?: boolean }> {
  return callFn('submit_online_exam', token, { attempt_id: attemptId, answers });
}

// Fire-and-forget: never block the exam UI on logging.
export function logExamEvent(token: string, attemptId: string, type: string): void {
  void callFn('log_exam_event', token, { attempt_id: attemptId, type }).catch(() => {});
}

export interface OnlineExamResult {
  exam_id: string;
  title: string;
  total_marks: number;
  score: number;
  total: number;
  submitted_at: string | null;
}

/** This student's PUBLISHED online-exam results for the active enrollment. */
export async function fetchOnlineExamResults(token: string): Promise<OnlineExamResult[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get_student_online_exams`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (data.exams ?? []) as OnlineExamResult[];
}
