'use client';

import { useRef, useState } from 'react';
import { Upload, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface RestoreResult {
  ok: boolean;
  restored?: Record<string, number>;
  errors?: Record<string, string>;
}

export function RestoreButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const confirmed = confirmText.trim().toUpperCase() === 'RESTORE';

  async function handleRestore() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a backup file first.');
      setState('error');
      return;
    }
    setState('working');
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      // Validate it parses before sending, for a clearer error.
      JSON.parse(text);

      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      const json = (await res.json()) as RestoreResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Restore failed (${res.status})`);

      setResult(json);
      setState(json.ok ? 'done' : 'error');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setState('error');
    }
  }

  const totalRows = result?.restored
    ? Object.values(result.restored).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This imports a backup file back into the live database. Rows with the same ID are
          overwritten with the file&apos;s version; missing rows are re-created. It does not
          delete anything. Use only when data is lost or being recovered.
        </p>
      </div>

      <div className="space-y-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
        />
        {fileName && <p className="text-xs text-muted-foreground">Selected: {fileName}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          Type <span className="font-mono font-semibold">RESTORE</span> to confirm
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="RESTORE"
          className="block w-40 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>

      <Button
        variant="destructive"
        onClick={handleRestore}
        disabled={state === 'working' || !confirmed}
      >
        {state === 'working' ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Restoring…
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Restore From File
          </>
        )}
      </Button>

      {state === 'done' && result && (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="h-4 w-4" />
            Restore complete — {totalRows} rows across {Object.keys(result.restored ?? {}).length} tables.
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error && <p>{error}</p>}
          {result?.errors &&
            Object.entries(result.errors).map(([t, msg]) => (
              <p key={t}>
                <span className="font-mono">{t}</span>: {msg}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
