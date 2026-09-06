'use client';

import { useState, useTransition } from 'react';
import { BellOff, CheckCheck, Check } from 'lucide-react';

import {
  resolveAlertAction,
  resolveAllAlertsAction,
  type SystemAlert,
} from '@/app/actions/alerts';
import { Button } from '@/components/ui/button';

const SEVERITY_STYLES: Record<SystemAlert['severity'], string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

const KIND_LABELS: Record<string, string> = {
  low_sms_balance: 'Low SMS balance',
  sms_send_failure: 'SMS send failure',
  sms_failures: 'SMS failure spike',
};

export function AlertsList({ alerts }: { alerts: SystemAlert[] }) {
  const [items, setItems] = useState(alerts);
  const [isPending, startTransition] = useTransition();
  const open = items.filter((a) => !a.resolved_at);
  const resolved = items.filter((a) => a.resolved_at);

  function resolve(id: number) {
    startTransition(async () => {
      const res = await resolveAlertAction(id);
      if (res.ok) {
        setItems((prev) =>
          prev.map((a) => (a.id === id ? { ...a, resolved_at: new Date().toISOString() } : a)),
        );
      }
    });
  }

  function resolveAll() {
    startTransition(async () => {
      const res = await resolveAllAlertsAction();
      if (res.ok) {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((a) => (a.resolved_at ? a : { ...a, resolved_at: now })));
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        <BellOff className="mx-auto mb-3 h-8 w-8 opacity-40" />
        No alerts yet. SMS balance and delivery problems will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {open.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Open ({open.length})</h2>
            <Button variant="outline" size="sm" onClick={resolveAll} disabled={isPending}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Resolve all
            </Button>
          </div>
          <ul className="divide-y">
            {open.map((a) => (
              <AlertRow key={a.id} alert={a} onResolve={() => resolve(a.id)} busy={isPending} />
            ))}
          </ul>
        </div>
      )}

      {resolved.length > 0 && (
        <div className="rounded-lg border bg-card opacity-70">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Resolved ({resolved.length})
            </h2>
          </div>
          <ul className="divide-y">
            {resolved.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert,
  onResolve,
  busy,
}: {
  alert: SystemAlert;
  onResolve?: () => void;
  busy?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${SEVERITY_STYLES[alert.severity]}`}
      >
        {alert.severity}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{KIND_LABELS[alert.kind] ?? alert.kind}</p>
        <p className="mt-0.5 text-sm text-muted-foreground break-words">{alert.message}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          {new Date(alert.created_at).toLocaleString()}
          {alert.resolved_at
            ? ` · resolved ${new Date(alert.resolved_at).toLocaleString()}`
            : ''}
        </p>
      </div>
      {onResolve && (
        <Button variant="ghost" size="sm" onClick={onResolve} disabled={busy} className="shrink-0">
          <Check className="mr-1 h-3.5 w-3.5" />
          Resolve
        </Button>
      )}
    </li>
  );
}
