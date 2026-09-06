'use client';

import { useState, useTransition } from 'react';
import {
  KeyRound, Copy, Check, AlertTriangle, RefreshCw,
  UserX, UserCheck, Trash2, RotateCcw, Unlink,
  Phone, MessageSquare, Lock, Plus, Loader2,
} from 'lucide-react';
import {
  setStudentAccountActiveAction,
  deleteStudentAccountAction,
  restoreStudentAccountAction,
  resetStudentPasswordAction,
  setStudentPasswordAction,
  unlinkStudentEnrollmentAction,
  setStudentLinkActiveAction,
  grantExtraChangesAction,
} from '@/app/actions/student-accounts';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

// ─── Helper: call admin-JWT-protected edge function ──────────────────────────

async function callAdminEdgeFn(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) return { ok: false, error: 'Not authenticated.' };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  let json: Record<string, unknown> = {};
  try { json = await res.json(); } catch { /* empty */ }

  if (!res.ok) {
    const err = json.error as Record<string, unknown> | undefined;
    return { ok: false, error: (err?.message as string | undefined) ?? `HTTP ${res.status}` };
  }
  return { ok: true, data: json };
}

// ── Toggle active / inactive ─────────────────────────────────────────────────

export function ToggleStudentActiveButton({
  accountId,
  isActive,
  isDeleted,
}: {
  accountId: string;
  isActive: boolean;
  isDeleted: boolean;
}) {
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (isDeleted) return null;

  function handle() {
    const label = isActive ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${label} this student account?`)) return;
    start(() => { void (async () => {
      try {
        await setStudentAccountActiveAction(accountId, !isActive);
        setMsg(`Account ${isActive ? 'deactivated' : 'reactivated'}.`);
      } catch (e) {
        setMsg(`Error: ${(e as Error).message}`);
      }
    })(); });
  }

  return (
    <div className="space-y-2">
      <Button
        variant={isActive ? 'destructive' : 'default'}
        size="sm"
        disabled={isPending}
        onClick={handle}
      >
        {isActive
          ? <><UserX className="mr-1.5 h-4 w-4" /> Deactivate</>
          : <><UserCheck className="mr-1.5 h-4 w-4" /> Reactivate</>}
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

// ── Soft-delete / restore ────────────────────────────────────────────────────

export function DeleteOrRestoreButton({
  accountId,
  name,
  isDeleted,
}: {
  accountId: string;
  name: string;
  isDeleted: boolean;
}) {
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handle() {
    if (isDeleted) {
      if (!confirm(`Restore account for ${name}?`)) return;
      start(() => { void (async () => {
        try {
          await restoreStudentAccountAction(accountId);
          setMsg('Account restored.');
        } catch (e) {
          setMsg(`Error: ${(e as Error).message}`);
        }
      })(); });
    } else {
      if (!confirm(`Delete account for ${name}? This will deactivate the account. All class links remain intact.`)) return;
      start(() => { void (async () => {
        try {
          await deleteStudentAccountAction(accountId);
          setMsg('Account deleted.');
        } catch (e) {
          setMsg(`Error: ${(e as Error).message}`);
        }
      })(); });
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant={isDeleted ? 'outline' : 'destructive'}
        size="sm"
        disabled={isPending}
        onClick={handle}
      >
        {isDeleted
          ? <><RotateCcw className="mr-1.5 h-4 w-4" /> Restore Account</>
          : <><Trash2 className="mr-1.5 h-4 w-4" /> Delete Account</>}
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

// ── Suspend / restore portal access for one enrollment ───────────────────────

export function SetLinkActiveButton({
  accountId,
  studentId,
  isActive,
}: {
  accountId: string;
  studentId: string;
  isActive: boolean;
}) {
  const [isPending, start] = useTransition();
  const [current, setCurrent] = useState(isActive);
  const [msg, setMsg] = useState<string | null>(null);

  function handle() {
    const action = current ? 'Suspend' : 'Restore';
    const detail = current
      ? 'The student will be blocked from using the portal for this class (chat, data). The link is kept.'
      : "Restore the student's portal access for this class.";
    if (!confirm(`${action} portal access?\n\n${detail}`)) return;
    start(() => { void (async () => {
      const r = await setStudentLinkActiveAction(accountId, studentId, !current);
      if (r.error) { setMsg(`Error: ${r.error}`); return; }
      setCurrent((v) => !v);
      setMsg(current ? 'Portal access suspended.' : 'Portal access restored.');
    })(); });
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handle}
        disabled={isPending}
        className={`flex items-center gap-1 text-xs disabled:opacity-40 transition-opacity ${
          current
            ? 'text-amber-600 hover:opacity-70'
            : 'text-emerald-600 hover:opacity-70'
        }`}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {current ? 'Suspend' : 'Restore'}
      </button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

// ── Unlink enrollment ────────────────────────────────────────────────────────

export function UnlinkEnrollmentButton({
  accountId,
  studentId,
  label,
}: {
  accountId: string;
  studentId: string;
  label: string;
}) {
  const [isPending, start] = useTransition();
  const [done, setDone] = useState(false);

  function handle() {
    if (!confirm(`Remove enrollment link for "${label}"? The student can re-join using the class invite link.`)) return;
    start(() => { void (async () => {
      await unlinkStudentEnrollmentAction(accountId, studentId);
      setDone(true);
    })(); });
  }

  if (done) return <span className="text-xs text-muted-foreground">Removed</span>;

  return (
    <button
      onClick={handle}
      disabled={isPending}
      className="flex items-center gap-1 text-xs text-destructive hover:opacity-70 disabled:opacity-40 transition-opacity"
    >
      <Unlink className="h-3 w-3" />
      {isPending ? 'Removing…' : 'Remove'}
    </button>
  );
}

// ── Reset password (auto-generate) + set manually ───────────────────────────

export function ResetStudentPasswordButton({
  accountId,
  name,
}: {
  accountId: string;
  name: string;
}) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error' | 'manual'>('idle');
  const [newPassword, setNewPassword] = useState('');
  const [manualPw, setManualPw]       = useState('');
  const [copied, setCopied]           = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');

  async function handleAutoReset() {
    setStep('loading');
    const result = await resetStudentPasswordAction(accountId);
    if (result.error || !result.newPassword) {
      setErrorMsg(result.error ?? 'Unknown error');
      setStep('error');
      return;
    }
    setNewPassword(result.newPassword);
    setStep('done');
  }

  async function handleManualSet() {
    if (manualPw.length < 6) { setErrorMsg('Password must be at least 6 characters.'); return; }
    setStep('loading');
    const result = await setStudentPasswordAction(accountId, manualPw);
    if (result.error) {
      setErrorMsg(result.error);
      setStep('error');
      return;
    }
    setNewPassword(manualPw);
    setStep('done');
  }

  function handleCopy() {
    void navigator.clipboard.writeText(newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function dismiss() {
    setStep('idle');
    setNewPassword('');
    setManualPw('');
    setCopied(false);
    setErrorMsg('');
  }

  if (step === 'idle') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStep('confirm')}
          className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
        >
          <KeyRound className="h-4 w-4" />
          Auto-generate Password
        </button>
        <button
          onClick={() => setStep('manual')}
          className="flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Lock className="h-4 w-4" />
          Set Password Manually
        </button>
      </div>
    );
  }

  if (step === 'manual') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Enter a new password for <span className="font-semibold">{name}</span>. Min 6 characters.
        </p>
        <input
          type="text"
          value={manualPw}
          onChange={(e) => { setManualPw(e.target.value); setErrorMsg(''); }}
          placeholder="New password"
          className="block w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          autoComplete="off"
        />
        {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleManualSet}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Set Password
          </button>
          <button onClick={dismiss} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">Auto-generate password for {name}?</p>
              <p className="mt-1 text-xs text-amber-700">
                A new random password will be generated. Share it with the student — shown only once.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAutoReset}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Yes, generate it
              </button>
              <button
                onClick={dismiss}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Updating password…
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">Failed to set password</p>
        <p className="mt-1 text-xs text-destructive/80">{errorMsg}</p>
        <button onClick={dismiss} className="mt-2 text-xs underline text-destructive hover:opacity-80">Dismiss</button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-800">Password set successfully</p>
      </div>
      <div>
        <p className="mb-1 text-xs text-emerald-700">
          New password for <span className="font-semibold">{name}</span> — share this securely. Shown once only.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-white px-3 py-2">
          <span className="flex-1 font-mono text-sm font-semibold tracking-wider select-all">{newPassword}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-emerald-700 hover:opacity-80 transition-opacity"
          >
            {copied
              ? <><Check className="h-3.5 w-3.5" /> Copied</>
              : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        </div>
      </div>
      <button onClick={dismiss} className="text-xs underline text-muted-foreground hover:opacity-80">Dismiss</button>
    </div>
  );
}

// ── Grant extra change attempts ──────────────────────────────────────────────

export function GrantExtraChangesCard({
  accountId,
  phoneChangeCount,
  phoneChangeMonth,
  pwChangeCount,
  pwChangeMonth,
}: {
  accountId: string;
  phoneChangeCount: number;
  phoneChangeMonth: string | null;
  pwChangeCount: number;
  pwChangeMonth: string | null;
}) {
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [pwMsg,    setPwMsg]    = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [pwLoading,    setPwLoading]    = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7);

  const phoneInThisMonth = phoneChangeMonth === currentMonth ? phoneChangeCount : 0;
  const pwInThisMonth    = pwChangeMonth === currentMonth    ? pwChangeCount    : 0;

  async function grantPhone() {
    if (!confirm('Reset this student\'s phone change counter to 0 for this month? They will be able to change their phone number again.')) return;
    setPhoneLoading(true);
    const r = await grantExtraChangesAction(accountId, 'phone');
    setPhoneLoading(false);
    setPhoneMsg(r.error ? `Error: ${r.error}` : 'Phone change counter reset. Student can change again.');
  }

  async function grantPw() {
    if (!confirm('Reset this student\'s password change counter to 0 for this month? They will be able to change their password again.')) return;
    setPwLoading(true);
    const r = await grantExtraChangesAction(accountId, 'password');
    setPwLoading(false);
    setPwMsg(r.error ? `Error: ${r.error}` : 'Password change counter reset. Student can change again.');
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Students are limited to 2 phone changes and 2 password changes per calendar month.
        Reset their counter here to grant extra attempts.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {/* Phone changes */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Phone Changes
          </div>
          <p className="text-xs text-muted-foreground">
            Used this month: <span className={phoneInThisMonth >= 2 ? 'text-red-600 font-semibold' : 'font-semibold'}>{phoneInThisMonth}/2</span>
          </p>
          <button
            onClick={grantPhone}
            disabled={phoneLoading}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 transition-colors"
          >
            {phoneLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><Plus className="h-3.5 w-3.5" /> Grant Again</>}
          </button>
          {phoneMsg && <p className="text-xs text-muted-foreground">{phoneMsg}</p>}
        </div>

        {/* Password changes */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Password Changes
          </div>
          <p className="text-xs text-muted-foreground">
            Used this month: <span className={pwInThisMonth >= 2 ? 'text-red-600 font-semibold' : 'font-semibold'}>{pwInThisMonth}/2</span>
          </p>
          <button
            onClick={grantPw}
            disabled={pwLoading}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 transition-colors"
          >
            {pwLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><Plus className="h-3.5 w-3.5" /> Grant Again</>}
          </button>
          {pwMsg && <p className="text-xs text-muted-foreground">{pwMsg}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Admin change student phone (OTP-verified) ────────────────────────────────

export function AdminChangePhoneCard({
  accountId,
  currentPhone,
}: {
  accountId: string;
  currentPhone: string;
}) {
  const [step,    setStep]    = useState<'idle' | 'enter' | 'otp' | 'done'>('idle');
  const [newPhone, setNewPhone] = useState('');
  const [otp,     setOtp]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState('');

  function reset() {
    setStep('idle'); setNewPhone(''); setOtp('');
    setError(null); setResult('');
  }

  async function sendOtp() {
    setError(null);
    if (!newPhone || newPhone.length < 9) { setError('Enter a valid phone number.'); return; }
    setLoading(true);
    const r = await callAdminEdgeFn('admin_send_phone_otp', { account_id: accountId, new_phone: newPhone });
    setLoading(false);
    if (!r.ok) { setError(r.error ?? 'Failed to send OTP.'); return; }
    setStep('otp');
  }

  async function confirmOtp() {
    setError(null);
    if (otp.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true);
    const r = await callAdminEdgeFn('admin_confirm_phone_otp', { account_id: accountId, new_phone: newPhone, otp });
    setLoading(false);
    if (!r.ok) { setError(r.error ?? 'Failed to verify code.'); return; }
    const data = r.data as Record<string, unknown>;
    setResult((data?.new_phone as string | undefined) ?? newPhone);
    setStep('done');
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-800">Phone changed to {result}</p>
        </div>
        <p className="text-xs text-emerald-700">Reload the page to see the updated phone number.</p>
        <button onClick={reset} className="text-xs underline text-muted-foreground hover:opacity-80">Dismiss</button>
      </div>
    );
  }

  if (step === 'idle') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Current phone: <span className="font-semibold font-mono">{currentPhone}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          An OTP will be sent to the new phone. The student must confirm the code verbally so you can complete the change.
        </p>
        <button
          onClick={() => setStep('enter')}
          className="flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors"
        >
          <Phone className="h-4 w-4" />
          Change Phone Number
        </button>
      </div>
    );
  }

  if (step === 'enter') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Enter the new phone number. An OTP will be sent to it.
        </p>
        <div className="flex items-center gap-2 max-w-xs">
          <input
            type="tel"
            value={newPhone}
            onChange={(e) => { setNewPhone(e.target.value); setError(null); }}
            placeholder="07XXXXXXXX or +94XXXXXXXXX"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={sendOtp}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
            Send OTP
          </button>
          <button onClick={reset} className="rounded-md border px-3 py-1.5 text-xs">Cancel</button>
        </div>
      </div>
    );
  }

  // OTP step
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        A 6-digit code was sent to <span className="font-semibold font-mono">{newPhone}</span>.
        Ask the student for the code and enter it below.
      </p>
      <input
        type="tel"
        inputMode="numeric"
        maxLength={6}
        value={otp}
        onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
        placeholder="000000"
        autoFocus
        className="block w-full max-w-xs rounded-md border bg-background px-3 py-2 text-center text-xl font-mono tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={confirmOtp}
          disabled={loading || otp.length !== 6}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Confirm
        </button>
        <button onClick={() => { setStep('enter'); setOtp(''); setError(null); }} className="rounded-md border px-3 py-1.5 text-xs">
          Resend Code
        </button>
        <button onClick={reset} className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}
