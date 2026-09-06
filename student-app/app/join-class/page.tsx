'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  Loader2,
  KeyRound,
  CheckCircle,
  BookOpen,
  LogIn,
  UserPlus,
  ShieldCheck,
  Clock,
  GraduationCap,
  Award,
  AlertCircle,
} from 'lucide-react';
import {
  getClassByCode,
  requestJoinClass,
  getGlobalSession,
  type GlobalStudentSession,
  type ClassCodeInfo,
  ApiError,
} from '@/lib/auth';

type Step =
  | { kind: 'enter_code' }
  | { kind: 'preview'; info: ClassCodeInfo; code: string }
  | { kind: 'sent'; info: ClassCodeInfo };

function Alert({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-xl border border-danger/20 bg-danger-light px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <p className="text-sm text-danger">{error}</p>
      </div>
    </div>
  );
}

export default function JoinClassPage() {
  const router = useRouter();
  const [session, setSession] = useState<GlobalStudentSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [step, setStep]       = useState<Step>({ kind: 'enter_code' });
  const [code, setCode]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setSession(getGlobalSession());
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-10 dark:from-blue-950/20 dark:via-background dark:to-indigo-950/20">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="relative w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 ring-1 ring-white/20">
              <Users className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Join a Class</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in first, then enter the class code your teacher shared.
            </p>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-xl shadow-primary/5 space-y-3">
            <Link
              href={`/login?next=${encodeURIComponent('/join-class')}`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98]"
            >
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
            <Link
              href={`/register?next=${encodeURIComponent('/join-class')}`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-border bg-background text-sm font-semibold transition-all hover:bg-muted active:scale-[0.98]"
            >
              <UserPlus className="h-4 w-4" /> Create Account
            </Link>
            <div className="mt-2 flex items-start gap-2.5 rounded-xl bg-muted/50 px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                One account works for all your classes \u2014 even with different teachers.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim()) { setError('Enter the class code.'); return; }
    setBusy(true);
    try {
      const info = await getClassByCode(code.trim());
      setStep({ kind: 'preview', info, code: code.trim() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  async function handleSendRequest(info: ClassCodeInfo, theCode: string) {
    setError(null);
    setBusy(true);
    try {
      await requestJoinClass(theCode);
      setStep({ kind: 'sent', info });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  const cardClasses = 'rounded-2xl border border-border/50 bg-card p-6 shadow-xl shadow-primary/5';

  if (step.kind === 'sent') {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-10 dark:from-blue-950/20 dark:via-background dark:to-indigo-950/20">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="relative w-full max-w-sm">
          <div className={`${cardClasses} text-center py-8`}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-light">
              <CheckCircle className="h-7 w-7 text-success" />
            </div>
            <h2 className="mb-2 text-lg font-bold">Request sent!</h2>
            <p className="text-sm text-muted-foreground">
              Your request to join <span className="font-semibold text-foreground">{step.info.subject}</span>{' '}
              (Grade {step.info.grade} \u00B7 {step.info.batch}) was sent to{' '}
              <span className="font-semibold text-foreground">
                {step.info.teacher_name ?? step.info.teacher_username ?? 'your teacher'}
              </span>.
            </p>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-warning-light px-4 py-3 text-left">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed text-warning">
                Your teacher needs to accept the request. The class will appear on your dashboard once accepted.
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98]"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (step.kind === 'preview') {
    const { info } = step;
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-10 dark:from-blue-950/20 dark:via-background dark:to-indigo-950/20">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="relative w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 ring-1 ring-white/20">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Is this your class?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Signed in as <span className="font-semibold text-foreground">{session.account.name}</span>
            </p>
          </div>

          <div className={cardClasses}>
            <p className="text-lg font-semibold leading-tight">{info.subject}</p>
            <p className="mt-1 text-sm text-muted-foreground">Grade {info.grade} \u00B7 {info.batch}</p>

            <div className="mt-4 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light">
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Teacher</p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {info.teacher_name ?? info.teacher_username ?? '\u2014'}
                  </p>
                </div>
              </div>

              {info.teacher_qualifications.length > 0 && (
                <ul className="mt-3 space-y-2 border-t pt-3">
                  {info.teacher_qualifications.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Award className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                      <span className="text-xs leading-snug text-foreground">{q}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Alert error={error} />

            <button
              onClick={() => handleSendRequest(info, step.code)}
              disabled={busy}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              {busy ? 'Sending\u2026' : 'Send Join Request'}
            </button>
            <button
              onClick={() => { setStep({ kind: 'enter_code' }); setError(null); }}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border-2 border-border bg-background text-sm font-semibold transition-all hover:bg-muted active:scale-[0.98]"
            >
              Not my class \u2014 try another code
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-10 dark:from-blue-950/20 dark:via-background dark:to-indigo-950/20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 ring-1 ring-white/20">
            <KeyRound className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Join a Class</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter the class code your teacher shared.
          </p>
        </div>

        <form onSubmit={handleLookup} className={cardClasses}>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="jc-code">Class code</label>
          <input
            id="jc-code"
            type="text"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. X4K2M9"
            autoFocus
            className="h-12 w-full rounded-xl border bg-background px-3 text-center text-lg font-bold tracking-[0.3em] outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          />

          <Alert error={error} />

          <button
            type="submit"
            disabled={busy}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            {busy ? 'Looking up\u2026' : 'Find Class'}
          </button>
        </form>
      </div>
    </main>
  );
}
