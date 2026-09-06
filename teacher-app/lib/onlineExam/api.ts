// Teacher-side online-exam API. Exams are inherently online, so these talk to
// the cloud directly (RPC to create from the question bank, REST to list/read).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

const REST = `${SUPABASE_URL}/rest/v1`;

export interface OnlineExam {
  id: string;
  teacher_id: string;
  class_id: string;
  title: string;
  join_code: string;
  duration_minutes: number;
  question_count: number;
  total_marks: number;
  status: 'draft' | 'published' | 'closed';
  results_published: boolean;
  created_at: string;
}

export interface ExamAttemptRow {
  id: string;
  student_id: string;
  status: 'in_progress' | 'submitted';
  score: number | null;
  total: number | null;
  focus_lost_count: number;
  submitted_at: string | null;
  students: { name: string; student_code: string } | null;
}

function headers(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
    ...extra,
  };
}

/** Build + publish an exam from the class's question bank. Returns the new exam. */
export async function createOnlineExam(
  token: string,
  input: { classId: string; title: string; questionCount: number; durationMinutes: number },
): Promise<OnlineExam> {
  const res = await fetch(`${REST}/rpc/create_online_exam`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      p_class_id: input.classId,
      p_title: input.title,
      p_question_count: input.questionCount,
      p_duration: input.durationMinutes,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    // Postgres RAISE messages surface in the body — map the common ones.
    if (body.includes('no questions')) throw new Error('This class has no questions in the bank yet. Add some first.');
    if (body.includes('class not found')) throw new Error('That class is no longer available.');
    throw new Error(`Could not create exam (${res.status}).`);
  }
  const data = JSON.parse(body);
  return (Array.isArray(data) ? data[0] : data) as OnlineExam;
}

export async function listOnlineExams(token: string, classId?: string): Promise<OnlineExam[]> {
  let url = `${REST}/online_exams?deleted_at=is.null&order=created_at.desc&select=*`;
  if (classId) url += `&class_id=eq.${classId}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

export async function getOnlineExam(token: string, examId: string): Promise<OnlineExam | null> {
  const res = await fetch(`${REST}/online_exams?id=eq.${examId}&select=*&limit=1`, { headers: headers(token) });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function getExamResults(token: string, examId: string): Promise<ExamAttemptRow[]> {
  const url = `${REST}/online_exam_attempts?exam_id=eq.${examId}` +
    `&select=id,student_id,status,score,total,focus_lost_count,submitted_at,students(name,student_code)` +
    `&order=score.desc.nullslast`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

export async function setExamStatus(token: string, examId: string, status: 'published' | 'closed'): Promise<void> {
  const res = await fetch(`${REST}/online_exams?id=eq.${examId}`, {
    method: 'PATCH',
    headers: headers(token, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Could not update the exam.');
}

/** Release (or hide) the marks so students can see their own result. */
export async function setResultsPublished(token: string, examId: string, published: boolean): Promise<void> {
  const res = await fetch(`${REST}/online_exams?id=eq.${examId}`, {
    method: 'PATCH',
    headers: headers(token, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ results_published: published, results_published_at: published ? new Date().toISOString() : null }),
  });
  if (!res.ok) throw new Error('Could not update results.');
}

export async function deleteOnlineExam(token: string, examId: string): Promise<void> {
  const res = await fetch(`${REST}/online_exams?id=eq.${examId}`, {
    method: 'PATCH',
    headers: headers(token, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('Could not delete the exam.');
}
