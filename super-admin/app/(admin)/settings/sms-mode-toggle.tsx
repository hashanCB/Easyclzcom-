'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, Loader2, FlaskConical, Radio } from 'lucide-react';
import { updateSmsModeAction } from '@/app/actions/settings';

export function SmsModeToggle({ currentMode }: { currentMode: 'demo' | 'live' }) {
  const [mode, setMode]   = useState<'demo' | 'live'>(currentMode);
  const [msg, setMsg]     = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function switchTo(next: 'demo' | 'live') {
    if (next === mode || isPending) return;
    const label = next === 'live'
      ? 'Switch to Live mode? SMS will use your registered sender name. Make sure it is approved in your text.lk account first.'
      : 'Switch back to Demo mode? SMS will use TextLKDemo.';
    if (!confirm(label)) return;

    start(() => { void (async () => {
      setMsg(null); setError(null);
      const r = await updateSmsModeAction(next);
      if (r.error) { setError(r.error); return; }
      setMode(next);
      setMsg(next === 'live'
        ? 'Switched to Live mode. OTPs now use your registered sender name.'
        : 'Switched to Demo mode. OTPs now use TextLKDemo.');
    })(); });
  }

  return (
    <div className="space-y-4">
      {/* Toggle pills */}
      <div className="inline-flex rounded-lg border bg-muted p-1 gap-1">
        <button
          onClick={() => switchTo('demo')}
          disabled={isPending}
          className={[
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
            mode === 'demo'
              ? 'bg-white shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <FlaskConical className="h-4 w-4" />
          Demo
        </button>
        <button
          onClick={() => switchTo('live')}
          disabled={isPending}
          className={[
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
            mode === 'live'
              ? 'bg-white shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <Radio className="h-4 w-4" />
          Live
        </button>
      </div>

      {/* Status description */}
      {mode === 'demo' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
          <p className="font-semibold">Demo Mode — Sender: TextLKDemo</p>
          <p className="text-xs text-amber-700">
            Using text.lk&apos;s free demo sender. Delivery is limited and may be unreliable.
            Switch to Live once your sender name is approved in your text.lk account.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 space-y-1">
          <p className="font-semibold">Live Mode — Using your registered sender name</p>
          <p className="text-xs text-emerald-700">
            OTPs will be sent using the sender name configured below. Make sure it is approved in text.lk before using this mode.
          </p>
        </div>
      )}

      {/* Feedback */}
      {isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Saving…
        </div>
      )}
      {msg && !isPending && (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle className="h-4 w-4" /> {msg}
        </div>
      )}
      {error && !isPending && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
