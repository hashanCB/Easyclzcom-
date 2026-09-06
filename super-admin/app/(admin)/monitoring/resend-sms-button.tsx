'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, Check, X } from 'lucide-react';

import { resendSmsAction } from '@/app/actions/messages';

export function ResendSmsButton({ messageId }: { messageId: string }) {
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<'sent' | 'failed' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function handleResend() {
    setOutcome(null);
    setMsg(null);
    startTransition(() => { void (async () => {
      const result = await resendSmsAction(messageId);
      if (result.status === 'sent') {
        setOutcome('sent');
      } else {
        setOutcome('failed');
        setMsg(result.error ?? 'Failed');
      }
    })(); });
  }

  if (outcome === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <Check className="h-3.5 w-3.5" /> Sent
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleResend}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'Sending…' : 'Resend'}
      </button>
      {outcome === 'failed' && msg && (
        <span className="inline-flex items-center gap-1 text-xs text-destructive" title={msg}>
          <X className="h-3 w-3" /> Failed again
        </span>
      )}
    </div>
  );
}
