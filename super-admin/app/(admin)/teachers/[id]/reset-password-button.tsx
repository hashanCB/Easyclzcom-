'use client';

import { useState } from 'react';
import { KeyRound, Copy, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { resetTeacherPasswordAction } from '@/app/actions/teachers';

interface Props {
  teacherId: string;
  username: string;
}

export function ResetPasswordButton({ teacherId, username }: Props) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [newPassword, setNewPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleReset() {
    setStep('loading');
    const result = await resetTeacherPasswordAction(teacherId);
    if (result.error || !result.credentials) {
      setErrorMsg(result.error ?? 'Unknown error');
      setStep('error');
      return;
    }
    setNewPassword(result.credentials.password);
    setStep('done');
  }

  function handleCopy() {
    void navigator.clipboard.writeText(newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setStep('idle');
    setNewPassword('');
    setCopied(false);
    setErrorMsg('');
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('confirm')}
        className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50 transition-colors"
      >
        <KeyRound className="h-4 w-4" />
        Reset Password
      </button>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Reset password for <span className="font-mono">{username}</span>?
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                A new password will be generated. The teacher will need this new password to log in.
                Share it securely — it is shown only once.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Yes, reset it
              </button>
              <button
                onClick={handleClose}
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Generating new password…
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">Failed to reset password</p>
        <p className="mt-1 text-xs text-destructive/80">{errorMsg}</p>
        <button
          onClick={handleClose}
          className="mt-2 text-xs underline text-destructive hover:opacity-80"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // ── Done — show new password ──────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/20 space-y-3">
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          Password reset successfully
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs text-emerald-700 dark:text-emerald-400">
          New password for <span className="font-mono font-semibold">{username}</span> — share this securely. It will not be shown again.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-white dark:bg-emerald-950/40 px-3 py-2">
          <span className="flex-1 font-mono text-sm font-semibold tracking-wider select-all">
            {newPassword}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 hover:opacity-80 transition-opacity"
            title="Copy to clipboard"
          >
            {copied ? (
              <><Check className="h-3.5 w-3.5" /> Copied</>
            ) : (
              <><Copy className="h-3.5 w-3.5" /> Copy</>
            )}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Tell the teacher to log in with this password and then change it immediately from Settings → Change Password.
      </p>

      <button
        onClick={handleClose}
        className="text-xs underline text-muted-foreground hover:opacity-80"
      >
        Dismiss
      </button>
    </div>
  );
}
