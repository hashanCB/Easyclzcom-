'use client';

import { useRef, useState } from 'react';
import { Download, Upload, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface RestoreResult {
  ok: boolean;
  restored?: Record<string, number>;
  skipped?: Record<string, number>;
  errors?: Record<string, string>;
}

interface Props {
  teacherId: string;
  username: string;
}

export function TeacherDataBackup({ teacherId, username }: Props) {
  // --- Download state ---
  const [dlState, setDlState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [dlError, setDlError] = useState<string | null>(null);

  // --- Restore state ---
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [rsState, setRsState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [rsError, setRsError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const confirmed = confirmText.trim().toUpperCase() === 'RESTORE';

  async function handleDownload() {
    setDlState('working');
    setDlError(null);
    try {
      const res = await fetch(`/api/teachers/${teacherId}/backup`);
      if (!res.ok) throw new Error(`Backup failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const safe = username.replace(/[^a-zA-Z0-9_-]/g, '') || 'teacher';
      const a = document.createElement('a');
      a.href = url;
      a.download = `classpay-${safe}-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDlState('done');
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Something went wrong');
      setDlState('error');
    }
  }

  async function handleRestore() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setRsError('Choose a backup file first.');
      setRsState('error');
      return;
    }
    setRsState('working');
    setRsError(null);
    setResult(null);
    try {
      const text = await file.text();
      JSON.parse(text); // validate before sending, for a clearer error
      const res = await fetch(`/api/teachers/${teacherId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      const json = (await res.json()) as RestoreResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Restore failed (${res.status})`);
      setResult(json);
      setRsState(json.ok ? 'done' : 'error');
    } catch (e) {
      setRsError(e instanceof Error ? e.message : 'Something went wrong');
      setRsState('error');
    }
  }

  const totalRows = result?.restored
    ? Object.values(result.restored).reduce((a, b) => a + b, 0)
    : 0;
  const totalSkipped = result?.skipped
    ? Object.values(result.skipped).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Download */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Download a full backup of this teacher&apos;s data (classes, students, attendance,
          marks, payments, messages and more). Keep it safe for recovery. If data is ever lost,
          re-upload it below to restore it to the cloud — the teacher then taps
          <span className="font-medium"> &ldquo;Restore from cloud&rdquo;</span> in their app to
          pull it back onto their phone. (This file is for admin re-upload only; it is not the
          encrypted format the teacher app imports directly.)
        </p>
        <Button onClick={handleDownload} disabled={dlState === 'working'}>
          {dlState === 'working' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Preparing backup…
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download Teacher Backup
            </>
          )}
        </Button>
        {dlState === 'done' && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle className="h-4 w-4" />
            Backup downloaded.
          </div>
        )}
        {dlState === 'error' && dlError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {dlError}
          </div>
        )}
      </div>

      {/* Restore */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Import a backup file to recover this teacher&apos;s lost data. Rows with the same ID
            are overwritten with the file&apos;s version; missing rows are re-created. It never
            deletes. Rows belonging to a different teacher are ignored.
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
          disabled={rsState === 'working' || !confirmed}
        >
          {rsState === 'working' ? (
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

        {rsState === 'done' && result && (
          <div className="space-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle className="h-4 w-4" />
              Restore complete — {totalRows} rows across {Object.keys(result.restored ?? {}).length} tables.
            </div>
            {totalSkipped > 0 && (
              <p className="text-xs text-emerald-700/80">
                {totalSkipped} row(s) ignored (belonged to another teacher).
              </p>
            )}
          </div>
        )}

        {rsState === 'error' && (
          <div className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {rsError && <p>{rsError}</p>}
            {result?.errors &&
              Object.entries(result.errors).map(([t, msg]) => (
                <p key={t}>
                  <span className="font-mono">{t}</span>: {msg}
                </p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
