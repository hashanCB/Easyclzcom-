'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, Loader2, FlaskConical, CreditCard } from 'lucide-react';
import { updateStripeModeAction } from '@/app/actions/settings';

export function StripeModeToggle({ currentMode }: { currentMode: 'test' | 'live' }) {
  const [mode, setMode]   = useState<'test' | 'live'>(currentMode);
  const [msg, setMsg]     = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function switchTo(next: 'test' | 'live') {
    if (next === mode || isPending) return;
    const label = next === 'live'
      ? 'Switch to LIVE payments? Teachers will be charged with real cards using the live keys saved below.'
      : 'Switch back to Test mode? Checkouts will use Stripe test cards only — no real money moves.';
    if (!confirm(label)) return;

    start(() => { void (async () => {
      setMsg(null); setError(null);
      const r = await updateStripeModeAction(next);
      if (r.error) { setError(r.error); return; }
      setMode(next);
      setMsg(next === 'live'
        ? 'Switched to Live. New checkouts charge real cards.'
        : 'Switched to Test. New checkouts use Stripe test cards.');
    })(); });
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border bg-muted p-1 gap-1">
        <button
          onClick={() => switchTo('test')}
          disabled={isPending}
          className={[
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
            mode === 'test'
              ? 'bg-white shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <FlaskConical className="h-4 w-4" />
          Test
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
          <CreditCard className="h-4 w-4" />
          Live
        </button>
      </div>

      {mode === 'test' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
          <p className="font-semibold">Test Mode — no real charges</p>
          <p className="text-xs text-amber-700">
            Checkouts use the Stripe test key. Pay with test card 4242 4242 4242 4242.
            Switch to Live when you are ready to take real payments.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 space-y-1">
          <p className="font-semibold">Live Mode — real payments</p>
          <p className="text-xs text-emerald-700">
            Checkouts charge real cards using the live Stripe key. The live webhook
            secret must be configured for subscriptions to activate.
          </p>
        </div>
      )}

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
