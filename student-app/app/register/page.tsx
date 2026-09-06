'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { GraduationCap, Loader2, Phone, User, Lock, ArrowRight, CheckCircle, ShieldCheck, ChevronLeft, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { requestStudentRegisterOtp, confirmStudentRegisterOtp, ApiError } from '@/lib/auth';
import Link from 'next/link';

function isSafeRedirect(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor={htmlFor}>{children}</label>;
}

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

function RegisterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = isSafeRedirect(params.get('next'));

  const [phone, setPhone]       = useState('');
  const [name, setName]         = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const [step, setStep]         = useState<'form' | 'otp'>('form');
  const [otp, setOtp]           = useState<string[]>(Array(6).fill(''));
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim())          { setError('Enter your phone number.'); return; }
    if (!name.trim())           { setError('Enter your name.');          return; }
    if (password.length < 6)    { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)   { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { debugOtp } = await requestStudentRegisterOtp(phone.trim(), name.trim(), password);
      setDebugOtp(debugOtp ?? null);
      if (debugOtp) setOtp(debugOtp.split(''));
      setStep('otp');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'conflict'
          ? 'An account with this phone number already exists.'
          : err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally { setLoading(false); }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const otpStr = otp.join('');
    if (otpStr.length !== 6) { setError('Enter the full 6-digit code.'); return; }

    setLoading(true);
    try {
      await confirmStudentRegisterOtp(phone.trim(), otpStr);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'expired' || err.code === 'too_many_attempts' || err.code === 'not_found') {
          setError(`${err.message} Tap \u201cBack\u201d to restart.`);
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally { setLoading(false); }
  }

  async function handleResend() {
    setError(null);
    setLoading(true);
    try {
      const { debugOtp } = await requestStudentRegisterOtp(phone.trim(), name.trim(), password);
      setDebugOtp(debugOtp ?? null);
      setOtp(Array(6).fill(''));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not resend the code.');
    } finally { setLoading(false); }
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const data = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!data) return;
    const newOtp = data.split('').concat(Array(6).fill('')).slice(0, 6);
    setOtp(newOtp);
    const lastIndex = Math.min(data.length, 5);
    otpRefs.current[lastIndex]?.focus();
  }

  const cardClasses = 'rounded-2xl border border-border/50 bg-card p-6 shadow-xl shadow-primary/5';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-10 dark:from-blue-950/20 dark:via-background dark:to-indigo-950/20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 ring-1 ring-white/20">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {done ? 'All set!' : step === 'otp' ? 'Verify your phone' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {done
              ? 'Your account has been created successfully.'
              : step === 'otp'
                ? `Enter the 6-digit code sent to ${phone}`
                : next
                  ? 'One account for all your classes.'
                  : 'One free account for all your classes.'}
          </p>
        </div>

        {done ? (
          <div className={`${cardClasses} text-center py-8`}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-light">
              <CheckCircle className="h-7 w-7 text-success" />
            </div>
            <h2 className="mb-2 text-lg font-bold">Account created!</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {next
                ? 'Sign in to finish joining your class.'
                : 'Sign in, then tap \u201cJoin a Class\u201d and enter your teacher\u2019s code.'}
            </p>
            <button onClick={() => router.push(next ? `/login?next=${encodeURIComponent(next)}` : '/login')}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98]">
              <ArrowRight className="h-4 w-4" /> Go to Sign in
            </button>
          </div>
        ) : step === 'otp' ? (
          <form onSubmit={handleVerify} className={cardClasses}>
            <div className="mb-4 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-light">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
            </div>

            {debugOtp && (
              <div className="mb-4 rounded-xl border border-warning/20 bg-warning-light px-4 py-3">
                <p className="text-xs text-warning">
                  <span className="font-semibold">Demo mode:</span> your code is{' '}
                  <span className="font-mono font-bold">{debugOtp}</span>
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="otp-0">Verification Code</Label>
              <div className="flex gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    id={i === 0 ? 'otp-0' : undefined}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="h-12 w-full rounded-xl border bg-background text-center text-lg font-bold tracking-wider outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                ))}
              </div>
            </div>

            <Alert error={error} />

            <button type="submit" disabled={loading}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {loading ? 'Verifying\u2026' : 'Verify & Create Account'}
            </button>

            <div className="mt-4 flex items-center justify-between text-xs">
              <button type="button" onClick={() => { setStep('form'); setError(null); setOtp(Array(6).fill('')); }}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button type="button" onClick={handleResend} disabled={loading}
                className="font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-60">
                Resend code
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className={cardClasses}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="phone" type="tel" autoComplete="tel" value={phone}
                    onChange={(e) => setPhone(e.target.value)} placeholder="+94 77 000 0000"
                    className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60" />
                </div>
              </div>

              <div>
                <Label htmlFor="name">Your Name</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="name" type="text" autoComplete="name" value={name}
                    onChange={(e) => setName(e.target.value)} placeholder="Kamal Perera"
                    className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60" />
                </div>
              </div>

              <div>
                <Label htmlFor="pw">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters"
                    className="h-11 w-full rounded-xl border bg-background pl-10 pr-10 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirm">Confirm Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password"
                    className="h-11 w-full rounded-xl border bg-background pl-10 pr-10 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60" />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Alert error={error} />

            <button type="submit" disabled={loading}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? 'Sending code\u2026' : 'Send Verification Code'}
            </button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link
                href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
                className="font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
