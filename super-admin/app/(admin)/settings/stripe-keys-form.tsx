'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, Loader2, KeyRound } from 'lucide-react';

import {
  updateStripeKeyAction,
  type StripeKeyField,
  type StripeKeyStatus,
} from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const FIELD_META: { field: StripeKeyField; label: string; placeholder: string }[] = [
  { field: 'stripe_secret_key_test', label: 'Test secret key', placeholder: 'sk_test_…' },
  { field: 'stripe_webhook_secret_test', label: 'Test webhook secret', placeholder: 'whsec_…' },
  { field: 'stripe_secret_key_live', label: 'Live secret key', placeholder: 'sk_live_…' },
  { field: 'stripe_webhook_secret_live', label: 'Live webhook secret', placeholder: 'whsec_…' },
];

export function StripeKeysForm({ statuses }: { statuses: StripeKeyStatus[] }) {
  const statusMap = new Map(statuses.map((s) => [s.field, s]));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FIELD_META.map((meta) => (
        <KeyRow key={meta.field} meta={meta} status={statusMap.get(meta.field)} />
      ))}
    </div>
  );
}

function KeyRow({
  meta,
  status,
}: {
  meta: { field: StripeKeyField; label: string; placeholder: string };
  status?: StripeKeyStatus;
}) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(status?.set ?? false);
  const [hint, setHint] = useState(status?.hint ?? '');
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, start] = useTransition();

  function save() {
    if (!value.trim() || isPending) return;
    start(() => { void (async () => {
      setError(null); setJustSaved(false);
      const r = await updateStripeKeyAction(meta.field, value);
      if (r.error) { setError(r.error); return; }
      setSaved(true);
      setHint(value.trim().length > 4 ? `…${value.trim().slice(-4)}` : '');
      setValue('');
      setJustSaved(true);
    })(); });
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <KeyRound className="h-3 w-3" />
        {meta.label}
        {saved ? (
          <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            saved {hint}
          </span>
        ) : status?.source === 'supabase_secret' ? (
          <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            ✓ active (Supabase secret)
          </span>
        ) : (
          <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
            not set
          </span>
        )}
      </label>
      <div className="flex gap-2">
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            saved
              ? `saved ${hint} — paste to replace`
              : status?.source === 'supabase_secret'
              ? 'working via Supabase secret — paste to manage here'
              : meta.placeholder
          }
          autoComplete="off"
          className="font-mono text-xs"
        />
        <Button size="sm" onClick={save} disabled={isPending || !value.trim()}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </Button>
      </div>
      {justSaved && !isPending && (
        <p className="flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle className="h-3 w-3" /> Saved. Takes effect on the next checkout.
        </p>
      )}
      {error && !isPending && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
