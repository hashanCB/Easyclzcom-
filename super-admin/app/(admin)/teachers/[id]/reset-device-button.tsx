'use client';

import { useState } from 'react';
import { Smartphone, Check, AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { resetTeacherDeviceAction } from '@/app/actions/teachers';

interface Props {
  teacherId: string;
  username: string;
  boundDeviceId: string | null;
}

export function ResetDeviceButton({ teacherId, username, boundDeviceId }: Props) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleReset() {
    setStep('loading');
    const result = await resetTeacherDeviceAction(teacherId);
    if (result.error || !result.ok) {
      setErrorMsg(result.error ?? 'Unknown error');
      setStep('error');
      return;
    }
    setStep('done');
  }

  function handleClose() {
    setStep('idle');
    setErrorMsg('');
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <div className="space-y-3">
        {boundDeviceId ? (
          <div className="flex items-start gap-2 text-sm">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground">Bound device: </span>
              <span className="font-mono text-xs">{boundDeviceId}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No device bound yet.</p>
        )}
        <button
          onClick={() => setStep('confirm')}
          className="flex items-center gap-2 rounded-md border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-950/50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Force Sign-Out (All Devices)
        </button>
      </div>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 dark:border-orange-700 dark:bg-orange-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                Sign <span className="font-mono">{username}</span> out of all devices?
              </p>
              <p className="mt-1 text-xs text-orange-700 dark:text-orange-400">
                The currently signed-in phone is logged out within ~2 minutes. No token
                is needed — the teacher just logs back in with their username and password
                on any phone. If the password may be compromised (e.g. a stolen phone),
                also use <strong>Reset Password</strong>.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition-colors"
              >
                Yes, sign out all devices
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
        Signing out all devices…
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">Failed to sign out devices</p>
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

  // ── Done ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/20 space-y-3">
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          All devices signed out
        </p>
      </div>
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        <span className="font-mono font-semibold">{username}</span> can log back in on any
        phone with their username and password — the new phone is bound automatically.
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
