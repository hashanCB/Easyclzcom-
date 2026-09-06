'use client';

import { useEffect, useState } from 'react';
import { Trophy, Loader2, AlertCircle, RefreshCcw, KeyRound, ChevronRight } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EnrollmentPicker } from '@/components/ui/EnrollmentPicker';
import { SuspendedBanner } from '@/components/ui/SuspendedBanner';
import { PendingPaymentBanner } from '@/components/ui/PendingPaymentBanner';
import { useEnrollments, markEnrollmentSuspended } from '@/lib/auth';
import { fetchStudentExams, pct, formatDate, type StudentExam } from '@/lib/exams';
import { fetchOnlineExamResults, type OnlineExamResult } from '@/lib/onlineExam';

function isSuspendedError(e: unknown): boolean {
  return (e as { code?: string })?.code === 'access_suspended';
}

export default function ExamsPage() {
  const enrollments           = useEnrollments();
  const [selectedIdx, setIdx] = useState(0);
  const enrollment            = enrollments[selectedIdx];

  const [exams,   setExams]   = useState<StudentExam[]>([]);
  const [online,  setOnline]  = useState<OnlineExamResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  function load(token: string) {
    setExams([]);
    setOnline([]);
    setLoading(true);
    setError(null);
    // Published online-exam results (best-effort — never blocks the main list).
    fetchOnlineExamResults(token).then(setOnline).catch(() => setOnline([]));
    fetchStudentExams(token)
      .then(setExams)
      .catch((e: Error) => {
        if (isSuspendedError(e) && enrollment && markEnrollmentSuspended(enrollment.student_id)) {
          window.location.reload();
          return;
        }
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!enrollment?.token || enrollment.portal_active === false) return;
    load(enrollment.token);
  }, [enrollment?.token, enrollment?.portal_active]);

  // Summary counts
  const passed  = exams.filter((e) => pct(e.mark, e.total_marks) >= 50).length;
  const failed  = exams.filter((e) => pct(e.mark, e.total_marks) <  50).length;
  const avgPct  = exams.length
    ? Math.round(exams.reduce((sum, e) => sum + pct(e.mark, e.total_marks), 0) / exams.length)
    : null;

  return (
    <div className="space-y-5">

      <div>
        <h1 className="text-xl font-bold">Exam Results</h1>
        {enrollment && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {enrollment.subject} · {enrollment.teacher_username}
          </p>
        )}
      </div>

      {/* Take a live online exam with a join code */}
      <a
        href="/exam"
        className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 transition active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
          <KeyRound className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-900">Take an exam</p>
          <p className="text-xs text-blue-700">Enter the code your teacher gave you</p>
        </div>
        <ChevronRight className="h-5 w-5 text-blue-400" />
      </a>

      {/* Online exam results (only the ones the teacher has published) */}
      {online.length > 0 && (
        <div className="rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-bold">Online Exams</p>
          </div>
          <div className="divide-y">
            {online.map((o) => {
              const p = o.total ? Math.round((o.score / o.total) * 100) : 0;
              const pass = p >= 50;
              return (
                <div key={o.exam_id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{o.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(o.submitted_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-bold">{o.score} / {o.total}</span>
                    <span className={`text-xs font-semibold ${pass ? 'text-green-600' : 'text-red-500'}`}>{p}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EnrollmentPicker enrollments={enrollments} selectedIdx={selectedIdx} onChange={setIdx} />

      {enrollment?.portal_active === false ? (
        <SuspendedBanner teacherUsername={enrollment.teacher_username} fullBlock />
      ) : (<>

      {enrollment?.join_status === 'pending_payment' && (
        <PendingPaymentBanner teacherUsername={enrollment.teacher_username} />
      )}

      {/* Summary strip */}
      {!loading && exams.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryTile label="Passed"  value={passed} variant="success" />
          <SummaryTile label="Failed"  value={failed} variant={failed > 0 ? 'danger' : 'muted'} />
          <SummaryTile label="Avg %"   value={avgPct ?? 0} unit="%" variant="info" />
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading results…</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => enrollment?.token && load(enrollment.token)}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-card px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
          >
            <RefreshCcw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {!loading && !error && enrollments.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-muted p-8 text-center">
          <p className="text-sm font-semibold">No classes enrolled</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Join a class first to see your exam results.
          </p>
        </div>
      )}

      {!loading && !error && enrollments.length > 0 && exams.length === 0 && (
        <Card>
          <CardBody className="py-10 text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-yellow-400" />
            <p className="font-semibold">No results yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your teacher will post exam results here.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Results list */}
      {!loading && !error && exams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All Exams</CardTitle>
          </CardHeader>
          <CardBody className="divide-y py-1">
            {exams.map((exam) => (
              <ExamRow key={exam.mark_id} exam={exam} />
            ))}
          </CardBody>
        </Card>
      )}

      </>)}
    </div>
  );
}

function ExamRow({ exam }: { exam: StudentExam }) {
  const percentage = pct(exam.mark, exam.total_marks);
  const passed     = percentage >= 50;

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{exam.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(exam.exam_date)}
            {exam.grade ? ` · Grade ${exam.grade}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={passed ? 'success' : 'danger'}>
            {passed ? 'Pass' : 'Fail'}
          </Badge>
          <span className="text-xs font-bold text-foreground">
            {exam.mark} / {exam.total_marks}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {exam.mark_remark || exam.exam_remark || ''}
        </span>
        <span className={`text-[11px] font-semibold ${passed ? 'text-green-600' : 'text-red-500'}`}>
          {percentage}%
        </span>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  unit = '',
  variant,
}: {
  label: string;
  value: number;
  unit?: string;
  variant: 'muted' | 'success' | 'danger' | 'info';
}) {
  const styles = {
    muted:   'bg-muted text-muted-foreground',
    success: 'bg-green-50 text-green-700',
    danger:  'bg-red-50 text-red-700',
    info:    'bg-blue-50 text-blue-700',
  };
  return (
    <div className={`rounded-xl p-3 text-center ${styles[variant]}`}>
      <p className="text-2xl font-bold leading-none">{value}{unit}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">{label}</p>
    </div>
  );
}
