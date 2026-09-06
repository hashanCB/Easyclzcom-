'use client';

import { useState, useTransition } from 'react';

import { bulkSuspendTeachersAction } from '@/app/actions/teachers';
import { Button } from '@/components/ui/button';

interface Teacher {
  id: string;
  username: string;
  name: string | null;
  is_active: boolean;
  sub_status: string | null;
  plan_code: string | null;
  health_score: number;
}

interface Props {
  teachers: Teacher[];
}

function HealthBadge({ score }: { score: number }) {
  let cls = 'bg-gray-100 text-gray-600';
  let label = 'Dead';
  if (score >= 70) { cls = 'bg-emerald-100 text-emerald-700'; label = 'Hot'; }
  else if (score >= 40) { cls = 'bg-yellow-100 text-yellow-700'; label = 'Warm'; }
  else if (score >= 10) { cls = 'bg-orange-100 text-orange-700'; label = 'Cold'; }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className="tabular-nums">{score}</span>
      <span>{label}</span>
    </span>
  );
}

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  basic: 'Basic',
  growth: 'Growth',
  unlimited: 'Unlimited',
  pro_monthly: 'Pro (legacy)',
  pro_override: 'Pro (grant)',
};

function PlanBadge({ status, planCode }: { status: string | null; planCode: string | null }) {
  const hasAccess = status === 'active' || status === 'trialing';
  if (!hasAccess) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        Free
      </span>
    );
  }
  const name = (planCode && PLAN_NAMES[planCode]) || planCode || 'Pro';
  const cls = status === 'trialing' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {name}{status === 'trialing' ? ' · Trial' : ''}
    </span>
  );
}

export function TeachersBulkTable({ teachers }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(teachers.map((t) => t.id)) : new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleBulkSuspend() {
    if (!selected.size) return;
    if (!confirm(`Suspend ${selected.size} teacher(s)?`)) return;
    startTransition(() => { void (async () => {
      try {
        await bulkSuspendTeachersAction([...selected]);
        setSelected(new Set());
        setMessage(`${selected.size} teacher(s) suspended.`);
      } catch (e) {
        setMessage(`Error: ${(e as Error).message}`);
      }
    })(); });
  }

  const allChecked = selected.size === teachers.length && teachers.length > 0;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <div className="space-y-3">
      {/* Bulk toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {selected.size > 0 && (
          <>
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={handleBulkSuspend}
            >
              Suspend Selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </>
        )}
        <a
          href="/api/teachers/export"
          className="ml-auto rounded-md border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80 transition-colors"
        >
          Export CSV
        </a>
      </div>

      {message && (
        <p className="rounded border px-3 py-2 text-sm bg-muted">{message}</p>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">Username</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Health</th>
              <th className="px-4 py-3 text-left font-medium">Plan</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!teachers.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No teachers found.
                </td>
              </tr>
            ) : (
              teachers.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b last:border-0 transition-colors ${
                    selected.has(t.id) ? 'bg-muted/30' : 'hover:bg-muted/20'
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggleOne(t.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono">{t.username}</td>
                  <td className="px-4 py-3">{t.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">
                    <HealthBadge score={t.health_score} />
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge status={t.sub_status} planCode={t.plan_code} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium ${
                        t.is_active ? 'text-emerald-600' : 'text-muted-foreground'
                      }`}
                    >
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/teachers/${t.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
