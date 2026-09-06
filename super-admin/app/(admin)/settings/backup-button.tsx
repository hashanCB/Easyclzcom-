'use client';

import { useState } from 'react';
import { Download, CheckCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function BackupButton() {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setState('working');
    setError(null);
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error(`Backup failed (${res.status})`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);

      const a = document.createElement('a');
      a.href = url;
      a.download = `classpay-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setState('error');
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleDownload} disabled={state === 'working'}>
        {state === 'working' ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Preparing backup…
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Download Full Backup
          </>
        )}
      </Button>

      {state === 'done' && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle className="h-4 w-4" />
          Backup downloaded.
        </div>
      )}
      {state === 'error' && error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
