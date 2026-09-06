import Link from 'next/link';
import { MessageSquare } from 'lucide-react';

import type { SmsMessageRow } from './page';
import { ResendSmsButton } from './resend-sms-button';
import { ResendAllButton } from './resend-all-button';

interface SmsRow {
  teacher_id: string;
  username: string;
  name: string | null;
  sent: number;
  failed: number;
  queued: number;
}

interface SmsFilter {
  status: string;
  from: string;
  to: string;
}

interface Props {
  rows: SmsRow[];
  messages: SmsMessageRow[];
  error?: string;
  messagesError?: string;
  filter: SmsFilter;
}

const STATUS_OPTIONS = ['all', 'sent', 'failed', 'queued', 'delivered', 'cancelled'] as const;

const STATUS_STYLES: Record<string, string> = {
  sent: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  queued: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-muted text-muted-foreground',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleString() : '—';
}

export function SmsTab({ rows, messages, error, messagesError, filter }: Props) {
  const totalSent = rows.reduce((s, r) => s + r.sent, 0);
  const totalFailed = rows.reduce((s, r) => s + r.failed, 0);

  // Real per-message status counts from the actual message log.
  const realSent = messages.filter((m) => m.status === 'sent' || m.status === 'delivered').length;
  const realFailed = messages.filter((m) => m.status === 'failed').length;
  const realQueued = messages.filter((m) => m.status === 'queued').length;

  // IDs eligible for bulk resend within the current filter (failed + queued).
  const resendableIds = messages
    .filter((m) => m.status === 'failed' || m.status === 'queued')
    .map((m) => m.id);

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive">Failed to load SMS data: {error}</p>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        Live SMS via text.lk. The totals below are real send outcomes. Use the message log
        to see exactly what sent or failed (with the provider error), and re-send failed ones.
      </div>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Sent (last 30 days)</p>
            <p className="text-xl font-semibold">{totalSent.toLocaleString()}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-destructive/60" />
          <div>
            <p className="text-xs text-muted-foreground">Failed (last 30 days)</p>
            <p className="text-xl font-semibold">{totalFailed.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Per-teacher table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Teacher</th>
              <th className="px-4 py-3 text-right font-medium">Sent</th>
              <th className="px-4 py-3 text-right font-medium">Failed</th>
              <th className="px-4 py-3 text-right font-medium">Queued</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No SMS records in the last 30 days.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.teacher_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/teachers/${r.teacher_id}`}
                      className="font-mono text-primary underline-offset-4 hover:underline"
                    >
                      {r.username}
                    </Link>
                    {r.name && (
                      <span className="ml-2 text-muted-foreground">{r.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.sent.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.failed > 0 ? 'text-destructive' : ''}`}>
                    {r.failed.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {r.queued.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Real message log — what actually sent vs failed, with resend */}
      <div className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Message log</h3>
          <p className="text-xs text-muted-foreground">
            <span className="text-emerald-600">{realSent} sent</span> ·{' '}
            <span className="text-destructive">{realFailed} failed</span> ·{' '}
            <span className="text-amber-600">{realQueued} queued</span>
            <span className="ml-1">({messages.length} shown)</span>
          </p>
        </div>

        {/* Filter bar: status + date range. Plain GET form so it works server-side. */}
        <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          <input type="hidden" name="tab" value="sms" />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <select
              name="sms_status"
              defaultValue={filter.status}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All' : s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="date"
              name="from"
              defaultValue={filter.from}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              name="to"
              defaultValue={filter.to}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Apply
          </button>
          <Link
            href="/monitoring?tab=sms"
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Reset
          </Link>
          <div className="ml-auto">
            <ResendAllButton messageIds={resendableIds} />
          </div>
        </form>

        {messagesError && (
          <p className="text-sm text-destructive">Failed to load messages: {messagesError}</p>
        )}

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium">When</th>
                <th className="px-4 py-3 text-left font-medium">Teacher</th>
                <th className="px-4 py-3 text-left font-medium">Recipient</th>
                <th className="px-4 py-3 text-left font-medium">Message</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No SMS messages yet.
                  </td>
                </tr>
              ) : (
                messages.map((m) => {
                  const canResend = m.status === 'failed' || m.status === 'queued';
                  return (
                    <tr key={m.id} className="border-b last:border-0 align-top hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {fmt(m.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {m.teachers ? (
                          <Link
                            href={`/teachers/${m.teacher_id}`}
                            className="font-mono text-primary underline-offset-4 hover:underline"
                          >
                            {m.teachers.username}
                          </Link>
                        ) : (
                          <span className="font-mono text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{m.recipient_phone}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="truncate" title={m.body}>{m.body}</p>
                        {m.status === 'failed' && m.error && (
                          <p className="mt-0.5 text-xs text-destructive" title={m.error}>
                            {m.error}
                          </p>
                        )}
                        {m.retry_count > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            retried {m.retry_count}×
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {canResend ? <ResendSmsButton messageId={m.id} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
