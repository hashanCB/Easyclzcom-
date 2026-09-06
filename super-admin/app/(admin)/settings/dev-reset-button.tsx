'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DevResetButton() {
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'working' | 'done' | 'error'>('idle');
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState<{ total_rows_deleted: number; auth_users_deleted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (confirm !== 'RESET') return;
    setPhase('working');
    setError(null);
    try {
      const res = await fetch('/api/dev-reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Reset failed (${res.status})`);
      setResult(data);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setPhase('error');
    }
  }

  if (phase === 'done' && result) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 space-y-1">
        <p className="font-semibold">✓ DEV database cleared</p>
        <p>{result.total_rows_deleted} rows deleted · {result.auth_users_deleted} auth users deleted</p>
        <button className="text-xs underline text-emerald-700" onClick={() => { setPhase('idle'); setConfirm(''); setResult(null); }}>
          Reset again
        </button>
      </div>
    );
  }

  if (phase === 'confirming' || phase === 'working' || phase === 'error') {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-red-300 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">This deletes ALL data — teachers, students, payments, everything.</span>
          </div>
          <p className="text-xs text-red-700">
            System settings (plans, trial days, SMS config) are kept. Auth users are also deleted.
            There is no undo.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Type <span className="font-mono font-bold text-red-700">RESET</span> to confirm
          </label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="RESET"
            className="font-mono max-w-[200px] border-red-300 focus-visible:ring-red-400"
            disabled={phase === 'working'}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={confirm !== 'RESET' || phase === 'working'}
          >
            {phase === 'working' ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Clearing…</>
            ) : (
              <><Trash2 className="mr-2 h-4 w-4" />Clear DEV Database</>
            )}
          </Button>
          {phase !== 'working' && (
            <Button variant="outline" onClick={() => { setPhase('idle'); setConfirm(''); }}>
              Cancel
            </Button>
          )}
        </div>

        {phase === 'error' && error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <Button variant="destructive" onClick={() => setPhase('confirming')}>
      <Trash2 className="mr-2 h-4 w-4" />
      Reset DEV Database
    </Button>
  );
}
