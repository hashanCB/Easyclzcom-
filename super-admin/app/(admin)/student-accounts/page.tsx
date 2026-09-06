import Link from 'next/link';
import { Search } from 'lucide-react';

import { createAdminClient } from '@/lib/supabase/admin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TeacherCombobox } from './teacher-combobox';

// Always read live DB state — suspension/restore must never show stale.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { q?: string; status?: string; teacher?: string };
}

// Map from student_account_id → deduplicated class label strings
type ClassMap = Map<string, string[]>;

export default async function StudentAccountsPage({ searchParams }: PageProps) {
  const admin         = createAdminClient();
  const q             = searchParams.q?.trim().toLowerCase() ?? '';
  const status        = searchParams.status ?? 'active';
  const teacherFilter = searchParams.teacher ?? '';

  // Load teacher list for combobox (username + id).
  const { data: teachers } = await admin
    .from('teachers')
    .select('id, username')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('username');

  const teacherLabel = (teachers ?? []).find((t) => t.id === teacherFilter)?.username ?? '';

  // If filtering by teacher, resolve which student_account_ids belong to that teacher.
  let allowedAccountIds: Set<string> | null = null;
  if (teacherFilter) {
    const { data: links } = await admin
      .from('student_account_links')
      .select('student_account_id')
      .eq('teacher_id', teacherFilter);
    allowedAccountIds = new Set((links ?? []).map((l) => l.student_account_id));
  }

  // Base account query with status filter.
  let query = admin
    .from('student_accounts')
    .select('id, name, phone, is_active, deleted_at, created_at');

  if (status === 'active')   query = query.is('deleted_at', null).eq('is_active', true);
  if (status === 'inactive') query = query.is('deleted_at', null).eq('is_active', false);
  if (status === 'deleted')  query = query.not('deleted_at', 'is', null);

  // When filtering by teacher, push the ID filter to the DB query if the set is small enough.
  if (allowedAccountIds !== null) {
    const ids = [...allowedAccountIds];
    if (ids.length === 0) {
      // No students linked to this teacher — return empty immediately.
      return renderPage({ filtered: [], q, status, teacherFilter, teacherLabel, teachers: teachers ?? [], error: null, classMap: new Map() });
    }
    query = query.in('id', ids);
  }

  const { data: accounts, error } = await query.order('created_at', { ascending: false }).limit(500);

  let filtered = accounts ?? [];
  if (q) {
    filtered = filtered.filter(
      (a) => a.name.toLowerCase().includes(q) || a.phone.includes(q),
    );
  }

  // ── Fetch linked classes for each visible account ─────────────────────────
  const classMap: ClassMap = new Map();
  if (filtered.length > 0) {
    const accountIds = filtered.map((a) => a.id);

    const { data: links } = await admin
      .from('student_account_links')
      .select('student_account_id, student_id')
      .in('student_account_id', accountIds);

    if (links && links.length > 0) {
      const studentIds = links.map((l) => l.student_id);

      const { data: studentRows } = await admin
        .from('students')
        .select('id, subject, batch, grade')
        .in('id', studentIds);

      const studentMap = new Map((studentRows ?? []).map((s) => [s.id, s]));

      for (const link of links) {
        const s = studentMap.get(link.student_id);
        if (s) {
          const label = `${s.subject} · Gr.${s.grade} ${s.batch}`;
          const existing = classMap.get(link.student_account_id) ?? [];
          // Deduplicate (same student could appear via multiple paths)
          if (!existing.includes(label)) {
            classMap.set(link.student_account_id, [...existing, label]);
          }
        }
      }
    }
  }

  return renderPage({ filtered, q, status, teacherFilter, teacherLabel, teachers: teachers ?? [], error, classMap });
}

// ── Render ───────────────────────────────────────────────────────────────────

interface RenderProps {
  filtered: { id: string; name: string; phone: string; is_active: boolean; deleted_at: string | null; created_at: string }[];
  q: string;
  status: string;
  teacherFilter: string;
  teacherLabel: string;
  teachers: { id: string; username: string }[];
  error: { message: string } | null;
  classMap: ClassMap;
}

function renderPage({ filtered, q, status, teacherFilter, teacherLabel, teachers, error, classMap }: RenderProps) {
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Student Accounts</h1>

      <form className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search name or phone…" className="pl-9" />
        </div>

        {/* Teacher searchable combobox */}
        <TeacherCombobox
          teachers={teachers}
          defaultValue={teacherFilter}
          defaultLabel={teacherLabel}
        />

        {/* Status filter */}
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
          <option value="deleted">Deleted</option>
          <option value="all">All</option>
        </select>

        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {error && (
        <p className="text-sm text-destructive">Failed to load accounts: {error.message}</p>
      )}

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Phone</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Classes</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No student accounts found.
                </td>
              </tr>
            ) : (
              filtered.map((a) => {
                const classes = classMap.get(a.id) ?? [];
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{a.phone}</td>
                    <td className="px-4 py-3">
                      {a.deleted_at ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Deleted</span>
                      ) : a.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {classes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {classes.map((c) => (
                            <span
                              key={c}
                              className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(a.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/student-accounts/${a.id}`} className="text-primary underline-offset-4 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} account{filtered.length !== 1 ? 's' : ''}</p>
    </main>
  );
}
