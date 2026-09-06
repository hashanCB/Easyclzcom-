'use client';

import { useState, useTransition } from 'react';

import { grantProFreeAction, extendTrialAction, revokeProAction } from '@/app/actions/teachers';
import { Button } from '@/components/ui/button';

interface Props {
  teacherId: string;
  currentSubStatus: string | null;
  periodEnd: string | null;
}

export function SubscriptionActions({ teacherId, currentSubStatus, periodEnd }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function handleGrant() {
    const reason = prompt('Reason for free Pro grant (e.g. "VIP promo"):');
    if (reason === null) return; // cancelled
    startTransition(() => { void (async () => {
      const result = await grantProFreeAction(teacherId, reason);
      setMessage(
        result.error
          ? { type: 'err', text: result.error }
          : { type: 'ok', text: 'Pro access granted. Period set to 12 months.' },
      );
    })(); });
  }

  function handleRevoke() {
    const reason = prompt('Reason for revoking Pro (e.g. "grant made in error"):');
    if (reason === null) return; // cancelled
    if (!confirm('Revoke Pro now? The account switches to Free immediately.')) return;
    startTransition(() => { void (async () => {
      const result = await revokeProAction(teacherId, reason);
      setMessage(
        result.error
          ? { type: 'err', text: result.error }
          : { type: 'ok', text: 'Pro revoked. Account is now Free.' },
      );
    })(); });
  }

  function handleExtend() {
    const daysStr = prompt('Extend trial by how many days? (e.g. 30):', '30');
    if (daysStr === null) return;
    const days = parseInt(daysStr, 10);
    if (!Number.isFinite(days) || days <= 0) {
      setMessage({ type: 'err', text: 'Enter a valid number of days.' });
      return;
    }
    startTransition(() => { void (async () => {
      const result = await extendTrialAction(teacherId, days);
      setMessage(
        result.error
          ? { type: 'err', text: result.error }
          : { type: 'ok', text: `Trial extended by ${days} days.` },
      );
    })(); });
  }

  return (
    <div className="space-y-3">
      {message && (
        <p
          className={`rounded border px-3 py-2 text-sm ${
            message.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-destructive bg-destructive/10 text-destructive'
          }`}
        >
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={handleGrant}
        >
          Grant Pro Free
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleExtend}
        >
          Extend Trial
        </Button>
        {/* Hide Revoke once the period has ended — a granted free Pro stays
            'active' in the DB past its end date, but there is nothing left to
            revoke once the time is up. */}
        {(currentSubStatus === 'active' || currentSubStatus === 'trialing') &&
          !(periodEnd && new Date(periodEnd).getTime() <= Date.now()) && (
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={handleRevoke}
          >
            Revoke Pro
          </Button>
        )}
      </div>
      {currentSubStatus && (
        <p className="text-xs text-muted-foreground">
          Current status: <span className="font-mono">{currentSubStatus}</span>
        </p>
      )}
    </div>
  );
}
