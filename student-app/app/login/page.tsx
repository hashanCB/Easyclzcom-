'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { GraduationCap, Loader2, Phone, Lock, ArrowRight, MessageSquare, Check, UserPlus, Eye, EyeOff, AlertCircle, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { loginStudentGlobal, requestPasswordResetOtp, confirmPasswordReset, ApiError } from '@/lib/auth';

const RESEND_COOLDOWN = 120;

function isSafeRedirect(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

function PhoneInput({ value, onChange, id, autoFocus }: {
  value: string; onChange: (v: string) => void; id: string; autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Phone className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={id} type="tel" autoComplete="tel" value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="+94 77 000 0000" autoFocus={autoFocus}
        className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

function PasswordInput({ value, onChange, id, placeholder, autoComplete }: {
  value: string; onChange: (v: string) => void; id: string; placeholder: string; autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border bg-background pl-10 pr-10 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60"
      />
      <button
        type="button" onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor={htmlFor}>{children}</label>;
}

function ErrorAlert({ error, supportPhone }: { error: string | null; supportPhone?: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-xl border border-danger/20 bg-danger-light px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="text-sm text-danger">
          <p>{error}</p>
          {supportPhone && (
            <p className="mt-1">
              Call us:{' '}
              <a href={`tel:${supportPhone}`} className="font-semibold underline">{supportPhone}</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = isSafeRedirect(params.get('next'));

  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [forgot, setForgot]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim())    { setError('Enter your phone number.'); return; }
    if (!password.trim()) { setError('Enter your password.');     return; }
    setLoading(true);
    try {
      await loginStudentGlobal(phone.trim(), password);
      router.push(next ?? '/dashboard');
    } catch (err) {
      console.error('Login failed:', err);
      if (err instanceof ApiError) {
        setError(fmtErr(err));
      } else if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
        setError('Cannot reach the server. Check your internet connection and try again.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally { setLoading(false); }
  }

  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : '/register';

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
            {forgot ? 'Reset Password' : 'Welcome Back'}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {forgot
              ? 'Enter your phone to receive a reset code.'
              : next ? 'Sign in to continue joining your class.' : 'Sign in to access your classes.'}
          </p>
        </div>

        {forgot ? (
          <ForgotPasswordFlow initialPhone={phone} onBack={() => { setForgot(false); setError(null); }} />
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border/50 bg-card p-6 shadow-xl shadow-primary/5">
            <div className="space-y-4">
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <PhoneInput id="phone" value={phone} onChange={setPhone} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => { setForgot(true); setError(null); }}
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Forgot?
                  </button>
                </div>
                <PasswordInput id="password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />
              </div>
            </div>

            <ErrorAlert error={error} />

            <button type="submit" disabled={loading}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-60 disabled:hover:shadow-lg">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? 'Signing in\u2026' : 'Sign in'}
            </button>

            <div className="mt-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">New student?</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Link
              href={registerHref}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary/30 text-sm font-semibold text-primary transition-all hover:bg-primary/5 hover:border-primary/50 active:scale-[0.98]"
            >
              <UserPlus className="h-4 w-4" />
              Create an account
            </Link>
            <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
              {next
                ? 'Create one, then come back to finish joining your class.'
                : 'Free to join \u2014 then enter your teacher\u2019s class code.'}
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function ForgotPasswordFlow({ initialPhone, onBack }: { initialPhone: string; onBack: () => void }) {
  const [step,         setStep]         = useState<'enter' | 'otp' | 'done'>('enter');
  const [phone,        setPhone]        = useState(initialPhone);
  const [otp,          setOtp]          = useState<string[]>(Array(6).fill(''));
  const [newPw,        setNewPw]        = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [showNewPw,    setShowNewPw]    = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [devOtp,       setDevOtp]       = useState<string | null>(null);
  const [resendSecs,   setResendSecs]   = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startCountdown() {
    setResendSecs(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setResendSecs((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  }

  function handleApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
      setError(e.message);
      setSupportPhone((e.details?.support_phone as string | undefined) ?? null);
    } else {
      setError(fallback);
      setSupportPhone(null);
    }
  }

  async function sendOtp() {
    setError(null); setSupportPhone(null);
    if (!phone.trim()) { setError('Enter your phone number.'); return; }
    setLoading(true);
    try {
      const { dev_otp } = await requestPasswordResetOtp(phone.trim());
      setDevOtp(dev_otp ?? null);
      if (dev_otp) setOtp(dev_otp.split(''));
      setStep('otp');
      startCountdown();
    } catch (e) {
      handleApiError(e, 'Something went wrong.');
    } finally { setLoading(false); }
  }

  async function confirmReset() {
    setError(null); setSupportPhone(null);
    const otpStr = otp.join('');
    if (otpStr.length !== 6) { setError('Enter the full 6-digit code.'); return; }
    if (newPw.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await confirmPasswordReset(phone.trim(), otpStr, newPw);
      setStep('done');
    } catch (e) {
      handleApiError(e, 'Something went wrong.');
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
    <div className={cardClasses}>
      {step !== 'done' && (
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to sign in
        </button>
      )}

      {step === 'done' ? (
        <div className="space-y-5 text-center py-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-light">
            <Check className="h-7 w-7 text-success" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Password Reset</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your password has been reset. Sign in with your new password.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98]"
          >
            <ArrowRight className="h-4 w-4" /> Back to sign in
          </button>
        </div>
      ) : step === 'enter' ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="reset-phone">Phone Number</Label>
            <PhoneInput id="reset-phone" value={phone} onChange={setPhone} autoFocus />
            <p className="mt-1.5 text-xs text-muted-foreground">
              We\u2019ll send a 6-digit code to your registered number.
            </p>
          </div>

          <ErrorAlert error={error} supportPhone={supportPhone} />

          <button
            type="button"
            onClick={sendOtp}
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            {loading ? 'Sending\u2026' : 'Send Code'}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Code sent to <span className="font-semibold text-foreground">{phone}</span>
          </p>

          {devOtp && (
            <div className="rounded-xl border border-warning/20 bg-warning-light px-4 py-3">
              <p className="text-xs text-warning">
                <span className="font-semibold">DEV mode:</span> SMS skipped \u2014 code is{' '}
                <span className="font-mono font-bold tracking-widest">{devOtp}</span>
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

          <div className="space-y-3">
            <div>
              <Label htmlFor="reset-newpw">New Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="reset-newpw" type={showNewPw ? 'text' : 'password'} autoComplete="new-password"
                  value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="h-11 w-full rounded-xl border bg-background pl-10 pr-10 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60"
                />
                <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label htmlFor="reset-confirm">Confirm Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="reset-confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  className="h-11 w-full rounded-xl border bg-background pl-10 pr-10 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <ErrorAlert error={error} supportPhone={supportPhone} />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmReset}
              disabled={loading || otp.join('').length !== 6}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Reset Password
            </button>
            {resendSecs > 0 ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {Math.floor(resendSecs / 60)}:{String(resendSecs % 60).padStart(2, '0')}
              </span>
            ) : (
              <button
                type="button"
                onClick={sendOtp}
                className="shrink-0 rounded-xl border border-border bg-background px-4 h-11 text-xs font-medium hover:bg-muted transition-colors"
              >
                Resend
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function fmtErr(err: ApiError): string {
  if (err.code === 'pro_inactive')   return 'Student portal unavailable. Contact your teacher.';
  if (err.code === 'account_locked') return 'Too many failed attempts. Try again in 15 minutes.';
  return err.message;
}
