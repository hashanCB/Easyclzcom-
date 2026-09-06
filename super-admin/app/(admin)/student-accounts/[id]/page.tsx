import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  ToggleStudentActiveButton,
  DeleteOrRestoreButton,
  ResetStudentPasswordButton,
  UnlinkEnrollmentButton,
  SetLinkActiveButton,
  GrantExtraChangesCard,
  AdminChangePhoneCard,
} from './student-actions';

// Always read live DB state — suspension/restore must never show stale.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function StudentAccountDetailPage({ params }: PageProps) {
  const admin = createAdminClient();
  const { id } = params;

  const { data: account } = await admin
    .from('student_accounts')
    .select('id, name, phone, is_active, deleted_at, created_at, phone_change_month, phone_change_count, pw_change_month, pw_change_count')
    .eq('id', id)
    .maybeSingle();

  if (!account) notFound();

  // Load all class enrollments for this account.
  const { data: links } = await admin
    .from('student_account_links')
    .select('student_id, teacher_id, linked_at, is_active')
    .eq('student_account_id', id)
    .order('linked_at', { ascending: false });

  const studentIds  = (links ?? []).map((l) => l.student_id);
  const teacherIds  = [...new Set((links ?? []).map((l) => l.teacher_id))];

  const [{ data: students }, { data: teachers }] = await Promise.all([
    studentIds.length
      ? admin.from('students').select('id, name, student_code, grade, subject, batch, class_id').in('id', studentIds)
      : Promise.resolve({ data: [] }),
    teacherIds.length
      ? admin.from('teachers').select('id, username').in('id', teacherIds)
      : Promise.resolve({ data: [] }),
  ]);

  const studentMap = new Map((students ?? []).map((s) => [s.id, s]));
  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));

  const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleString() : '—';

  const isDeleted = !!account.deleted_at;

  return (
    <main className="container mx-auto max-w-4xl space-y-8 p-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/student-accounts"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Student Accounts
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{account.name}</h1>
          <p className="text-muted-foreground font-mono">{account.phone}</p>
        </div>
        <div>
          {isDeleted ? (
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">Deleted</span>
          ) : account.is_active ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">Active</span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">Inactive</span>
          )}
        </div>
      </div>

      {/* Account info */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Account Info</h2>
        <div className="rounded-lg border divide-y">
          {[
            ['Phone',    account.phone],
            ['Name',     account.name],
            ['Joined',   fmt(account.created_at)],
            ['Status',   isDeleted ? `Deleted at ${fmt(account.deleted_at)}` : account.is_active ? 'Active' : 'Deactivated'],
          ].map(([label, value]) => (
            <div key={label} className="flex px-4 py-3 text-sm">
              <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Class enrollments */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Class Enrollments
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal normal-case">
            {(links ?? []).length}
          </span>
        </h2>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Teacher</th>
                <th className="px-4 py-2 text-left font-medium">Student Code</th>
                <th className="px-4 py-2 text-left font-medium">Subject</th>
                <th className="px-4 py-2 text-left font-medium">Grade · Batch</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Linked</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {!(links ?? []).length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No class enrollments.</td>
                </tr>
              ) : (
                (links ?? []).map((l) => {
                  const s = studentMap.get(l.student_id);
                  const t = teacherMap.get(l.teacher_id);
                  const label = [t?.username, s?.student_code].filter(Boolean).join(' / ');
                  const isActive = (l as { is_active?: boolean }).is_active !== false;
                  return (
                    <tr key={l.student_id} className={`border-b last:border-0 ${!isActive ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-4 py-2 font-mono text-xs">{t?.username ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs">{s?.student_code ?? '—'}</td>
                      <td className="px-4 py-2">{s?.subject ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{s ? `${s.grade} · ${s.batch}` : '—'}</td>
                      <td className="px-4 py-2">
                        {isActive ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Suspended</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">{fmt(l.linked_at)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <SetLinkActiveButton
                            accountId={id}
                            studentId={l.student_id}
                            isActive={isActive}
                          />
                          <UnlinkEnrollmentButton accountId={id} studentId={l.student_id} label={label} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Account actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Account Status</h2>
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Deactivating prevents the student from signing in without deleting their data or class links.
            Deleting is a soft-delete — data is kept but the account is fully blocked and can be restored.
          </p>
          <div className="flex flex-wrap gap-3">
            <ToggleStudentActiveButton accountId={id} isActive={account.is_active} isDeleted={isDeleted} />
            <DeleteOrRestoreButton accountId={id} name={account.name} isDeleted={isDeleted} />
          </div>
        </div>
      </section>

      {/* Grant extra change attempts */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Grant Extra Attempts</h2>
        <div className="rounded-lg border p-4">
          <GrantExtraChangesCard
            accountId={id}
            phoneChangeCount={account.phone_change_count ?? 0}
            phoneChangeMonth={account.phone_change_month ?? null}
            pwChangeCount={account.pw_change_count ?? 0}
            pwChangeMonth={account.pw_change_month ?? null}
          />
        </div>
      </section>

      {/* Admin: Change phone number (OTP-verified) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Change Phone Number</h2>
        <div className="rounded-lg border p-4">
          <AdminChangePhoneCard accountId={id} currentPhone={account.phone} />
        </div>
      </section>

      {/* Password reset / set */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Password</h2>
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Auto-generate a new random password, or set one manually. Share with the student securely.
          </p>
          <ResetStudentPasswordButton accountId={id} name={account.name} />
        </div>
      </section>

    </main>
  );
}
