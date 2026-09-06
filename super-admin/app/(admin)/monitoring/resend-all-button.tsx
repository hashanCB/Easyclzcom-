'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';

import { resendAllSmsAction } from '@/app/actions/messages';

export function ResendAllButton({ messageIds }: { messageIds: string[] }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  const count = messageIds.length;
  if (count === 0) return null;

  function handleClick() {
    if (!confirm(`Re-send ${count} failed SMS now?`)) return;
    setResult(null);
    startTransition(() => { void (async () => {
      const r = await resendAllSmsAction(messageIds);
      setResult({ sent: r.sent ?? 0, failed: r.failed ?? 0 });
    })(); });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'Re-sending…' : `Resend all failed (${count})`}
      </button>
      {result && (
        <span className="text-xs text-muted-foreground">
          <span className="text-emerald-600">{result.sent} sent</span>
          {result.failed > 0 && <span className="text-destructive"> · {result.failed} still failed</span>}
        </span>
      )}
    </div>
  );
}
