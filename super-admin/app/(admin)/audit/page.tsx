import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// U44 — per-teacher audit log viewer (SRS §24.4).
// audit_logs has a super_admin SELECT policy, so the logged-in admin's server
// client can read every row. Filters are plain GET query params (no JS needed).

export const dynamic = 'force-dynamic';

const ACTIONS = [
  'payment.collect',
  'payment.correct',
  'payment.refund',
  'attendance.mark',
  'attendance.update',
  'student.update',
  'student.deactivate',
  'class.update',
  'class.deactivate',
  'assistant.login',
  'assistant.password_reset',
  'backup.create',
  'backup.restore',
  'subscription.activate',
  'subscription.cancel',
] as const;

const PAGE_SIZE = 100;

interface PageProps {
  searchParams: { teacher?: string; action?: string; page?: string };
}

interface AuditRow {
  id: string;
  teacher_id: string;
  user_id: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  device_id: string | null;
  occurred_at: string;
  teachers: { username: string; name: string | null } | null;
}

interface TeacherOption {
  id: string;
  username: string;
  name: string | null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function actionTone(action: string): string {
  if (action.startsWith('payment.refund') || action.endsWith('.deactivate') || action === 'subscription.cancel') {
    return 'bg-destructive/10 text-destructive';
  }
  if (action.startsWith('payment.') || action === 'subscription.activate') {
    return 'bg-emerald-500/10 text-emerald-600';
  }
  if (action.startsWith('backup.')) return 'bg-amber-500/10 text-amber-600';
  return 'bg-muted text-muted-foreground';
}

function compact(v: unknown): string {
  if (v == null) return '—';
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export default async function AuditPage({ searchParams }: PageProps) {
  const supabase = createClient();
  const admin = createAdminClient();

  const teacherFilter = searchParams.teacher?.trim() || '';
  const actionFilter = (ACTIONS as readonly string[]).includes(searchParams.action ?? '')
    ? searchParams.action!
    : '';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('audit_logs')
    .select('id, teacher_id, user_id, user_role, action, entity_type, entity_id, old_value, new_value, device_id, occurred_at, teachers(username, name)')
    .order('occurred_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (teacherFilter) query = query.eq('teacher_id', teacherFilter);
  if (actionFilter) query = query.eq('action', actionFilter);

  const [{ data: rows, error }, { data: teacherRows }] = await Promise.all([
    query,
    admin.from('teachers').select('id, username, name').order('username', { ascending: true }),
  ]);

  const logs = (rows ?? []) as unknown as AuditRow[];
  const teachers = (teacherRows ?? []) as TeacherOption[];
  const hasMore = logs.length === PAGE_SIZE;

  return (
    <main className="container mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Append-only record of important actions (SRS §24.4).
          Page {page} · showing {logs.length} {logs.length === 1 ? 'entry' : 'entries'}.
        </p>
      </div>

      {/* Filters — plain GET form, no JS */}
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Teacher</span>
          <select
            name="teacher"
            defaultValue={teacherFilter}
            className="h-9 rounded-md border bg-background px-3 text-sm min-w-48"
          >
            <option value="">All teachers</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name ? `${t.name} (${t.username})` : t.username}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Action</span>
          <select
            name="action"
            defaultValue={actionFilter}
            className="h-9 rounded-md border bg-background px-3 text-sm min-w-48"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Apply
        </button>
        {(teacherFilter || actionFilter) && (
          <a href="/audit" className="h-9 rounded-md border px-4 text-sm font-medium leading-9 hover:bg-muted">
            Clear
          </a>
        )}
      </form>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load audit log: {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Teacher</th>
              <th className="px-4 py-3 font-medium">By</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Old → New</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No audit entries match these filters.
                </td>
              </tr>
            ) : (
              logs.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtTime(row.occurred_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.teachers?.name ?? row.teachers?.username ?? row.teacher_id.slice(0, 8)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.user_role}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${actionTone(row.action)}`}>
                      {row.action}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {row.entity_type}
                    {row.entity_id ? <span className="ml-1 font-mono text-xs">{row.entity_id.slice(0, 8)}</span> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.old_value != null && <span>{compact(row.old_value)} → </span>}
                    {compact(row.new_value)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          <PaginationLink
            page={page - 1}
            teacher={teacherFilter}
            action={actionFilter}
            disabled={page <= 1}
            label="← Previous"
          />
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <PaginationLink
            page={page + 1}
            teacher={teacherFilter}
            action={actionFilter}
            disabled={!hasMore}
            label="Next →"
          />
        </div>
      )}
    </main>
  );
}

function PaginationLink({
  page, teacher, action, disabled, label,
}: {
  page: number; teacher: string; action: string; disabled: boolean; label: string;
}) {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (teacher) params.set('teacher', teacher);
  if (action) params.set('action', action);
  const href = `/audit${params.size ? `?${params}` : ''}`;

  if (disabled) {
    return <span className="h-9 rounded-md border px-4 text-sm font-medium leading-9 text-muted-foreground opacity-40">{label}</span>;
  }
  return (
    <a href={href} className="h-9 rounded-md border px-4 text-sm font-medium leading-9 hover:bg-muted">
      {label}
    </a>
  );
}
