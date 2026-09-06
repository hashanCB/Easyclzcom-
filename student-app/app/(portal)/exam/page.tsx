'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Loader2, AlertTriangle, Clock, CheckCircle2, Trophy } from 'lucide-react';
import { EnrollmentPicker } from '@/components/ui/EnrollmentPicker';
import { useEnrollments } from '@/lib/auth';
import {
  startExam, submitExam, logExamEvent,
  type ExamQuestion, type StartExamResult, ExamError,
} from '@/lib/onlineExam';
import { fetchFileDownloadUrl } from '@/lib/notes';

type Phase = 'enter' | 'taking' | 'done';

// Loads a presigned URL for an R2 image key (question/option image) and shows it.
function ExamImage({ r2Key, token, className }: { r2Key: string; token: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    fetchFileDownloadUrl(r2Key, token).then((u) => { if (on) setUrl(u); }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [r2Key, token]);
  if (failed) return null;
  if (!url) return <div className={`flex items-center justify-center rounded-lg bg-muted ${className ?? ''}`} style={{ minHeight: 60 }}><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`w-auto rounded-lg border object-contain ${className ?? ''}`} />;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ExamPage() {
  const enrollments = useEnrollments();
  const [selectedIdx, setIdx] = useState(0);
  const token = enrollments[selectedIdx]?.token ?? '';

  const [phase, setPhase] = useState<Phase>('enter');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attemptId, setAttemptId] = useState('');
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const [remaining, setRemaining] = useState(0);
  const [leaveCount, setLeaveCount] = useState(0);
  const [showWarn, setShowWarn] = useState(false);
  // score === null means: submitted, but the teacher has not published marks yet.
  const [result, setResult] = useState<{ score: number | null; total: number; published: boolean } | null>(null);

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const attemptRef = useRef('');
  attemptRef.current = attemptId;

  const doSubmit = useCallback(async (auto: boolean) => {
    if (phase !== 'taking') return;
    setBusy(true);
    setError(null);
    try {
      const payload = questions.map((q) => ({ question_id: q.id, selected_index: answersRef.current[q.id] ?? null }));
      const r = await submitExam(tokenRef.current, attemptRef.current, payload);
      setResult({ score: r.score, total: r.total, published: r.published });
      setPhase('done');
    } catch (e) {
      setError(e instanceof ExamError ? e.message : 'Could not submit. Check your connection and try again.');
      if (auto) setPhase('done'); // time is up regardless
    } finally {
      setBusy(false);
    }
  }, [phase, questions]);

  // Countdown — auto-submit at zero.
  useEffect(() => {
    if (phase !== 'taking') return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(t); void doSubmit(true); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, doSubmit]);

  // Anti-cheat: leaving the exam screen (switching app/tab) warns + is logged.
  useEffect(() => {
    if (phase !== 'taking') return;
    const onLeave = () => {
      if (document.hidden) {
        setShowWarn(true);
        setLeaveCount((c) => c + 1);
        logExamEvent(tokenRef.current, attemptRef.current, 'focus_lost');
      }
    };
    document.addEventListener('visibilitychange', onLeave);
    return () => document.removeEventListener('visibilitychange', onLeave);
  }, [phase]);

  async function handleStart() {
    if (!token) { setError('Pick your class first.'); return; }
    if (!code.trim()) { setError('Enter the exam code.'); return; }
    setBusy(true);
    setError(null);
    try {
      const data: StartExamResult = await startExam(token, code.trim().toUpperCase());
      setTitle(data.title);
      // Already finished + results published → show their marks straight away.
      if (data.status === 'result') {
        setResult({ score: data.score ?? 0, total: data.total ?? 0, published: true });
        setPhase('done');
        return;
      }
      setAttemptId(data.attempt_id ?? '');
      setQuestions(data.questions ?? []);
      setAnswers(data.saved_answers ?? {});
      setRemaining(data.remaining_seconds ?? 0);
      setPhase('taking');
    } catch (e) {
      const msg = e instanceof ExamError
        ? (e.code === 'already_done' ? 'You have already finished this exam.' : e.message)
        : 'Could not start the exam.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id] != null).length,
    [questions, answers],
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === 'done' && result) {
    // Submitted, but the teacher has not released the marks yet.
    if (!result.published || result.score === null) {
      return (
        <div className="mx-auto max-w-md space-y-4 py-10 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
          <h1 className="text-xl font-bold">{title}</h1>
          <div className="rounded-2xl border bg-card p-6">
            <p className="text-base font-semibold">Your answers are submitted ✅</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your marks will appear here once your teacher publishes the results. Check back later with the same code.
            </p>
          </div>
          {leaveCount > 0 && (
            <p className="text-xs text-amber-600">You left the screen {leaveCount} time(s) — your teacher can see this.</p>
          )}
          <a href="/dashboard" className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white">Back to home</a>
        </div>
      );
    }
    const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
    const pass = pct >= 50;
    return (
      <div className="mx-auto max-w-md space-y-4 py-8 text-center">
        <Trophy className={`mx-auto h-14 w-14 ${pass ? 'text-yellow-400' : 'text-muted-foreground'}`} />
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="rounded-2xl border bg-card p-6">
          <p className="text-4xl font-extrabold">{result.score}<span className="text-xl text-muted-foreground">/{result.total}</span></p>
          <p className={`mt-1 text-lg font-bold ${pass ? 'text-green-600' : 'text-red-500'}`}>{pct}%</p>
        </div>
        {leaveCount > 0 && (
          <p className="text-xs text-amber-600">You left the screen {leaveCount} time(s) — your teacher can see this.</p>
        )}
        <a href="/dashboard" className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white">Back to home</a>
      </div>
    );
  }

  // ── Taking ────────────────────────────────────────────────────────────────
  if (phase === 'taking') {
    const low = remaining <= 30;
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-24">
        {/* Sticky timer bar */}
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b bg-card px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{title}</p>
            <p className="text-xs text-muted-foreground">{answeredCount}/{questions.length} answered</p>
          </div>
          <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${low ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'}`}>
            <Clock className="h-4 w-4" /> {fmt(remaining)}
          </div>
        </div>

        {/* Anti-cheat warning */}
        {showWarn && (
          <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-700">Stay on the exam!</p>
              <p className="text-xs text-red-600">You left the screen {leaveCount} time(s). Your teacher is notified each time.</p>
            </div>
            <button onClick={() => setShowWarn(false)} className="ml-auto text-xs font-semibold text-red-700 underline">OK</button>
          </div>
        )}

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Questions */}
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-start gap-2">
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">Q{i + 1}</span>
              <p className="flex-1 text-sm font-semibold">{q.question_text}</p>
              <span className="shrink-0 text-xs text-muted-foreground">{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</span>
            </div>
            {q.question_image && <ExamImage r2Key={q.question_image} token={token} className="mb-3 max-h-72" />}
            <div className="space-y-2">
              {q.options.map((opt, idx) => {
                const picked = answers[q.id] === idx;
                const optImg = q.option_images?.[idx] ?? null;
                return (
                  <button
                    key={idx}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition ${picked ? 'border-blue-500 bg-blue-50 font-semibold' : 'border-muted bg-card hover:bg-muted/40'}`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${picked ? 'border-blue-500 bg-blue-500' : 'border-muted-foreground/40'}`}>
                      {picked && <span className="h-2 w-2 rounded-full bg-card" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      {opt && <span>{opt}</span>}
                      {optImg && <ExamImage r2Key={optImg} token={token} className="mt-1 max-h-40" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Submit */}
        <button
          onClick={() => doSubmit(false)}
          disabled={busy}
          className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl items-center justify-center gap-2 border-t bg-blue-600 px-4 py-4 text-base font-bold text-white disabled:opacity-70"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          Finish &amp; submit ({answeredCount}/{questions.length})
        </button>
      </div>
    );
  }

  // ── Enter code ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-md space-y-5 py-4">
      <div>
        <h1 className="text-xl font-bold">Take an Exam</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Enter the code your teacher gave you.</p>
      </div>

      <EnrollmentPicker enrollments={enrollments} selectedIdx={selectedIdx} onChange={setIdx} />

      <div className="rounded-2xl border bg-card p-5">
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Exam code</label>
        <div className="flex items-center gap-2 rounded-xl border-2 border-blue-200 px-3">
          <KeyRound className="h-5 w-5 text-blue-500" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={8}
            className="w-full bg-transparent py-3 text-lg font-bold uppercase tracking-widest outline-none"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleStart}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-70"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Start exam'}
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs text-amber-700">
          Stay on this screen during the exam. If you switch to another app, your teacher is notified.
        </p>
      </div>
    </div>
  );
}
