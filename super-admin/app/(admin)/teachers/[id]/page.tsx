import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { createAdminClient } from '@/lib/supabase/admin';
import { TeacherStatusBadge } from '@/components/teacher-status-badge';
import { ToggleActiveButton } from './toggle-active-button';
import { SubscriptionActions } from './subscription-actions';
import { TrialCountdown } from './trial-countdown';
import { ImpersonateButton } from './impersonate-button';
import { ResetPasswordButton } from './reset-password-button';
import { ResetDeviceButton } from './reset-device-button';
import { TeacherDataBackup } from './teacher-data-backup';

interface PageProps {
  params: { id: string };
}

export default async function TeacherDetailPage({ params }: PageProps) {
  const admin = createAdminClient();
  const { id } = params;

  const [
    { data: teacher },
    { data: sub },
    { data: sessions },
    { data: dupAttempts },
    { data: activeToken },
    { data: classes, count: classCount },
    { data: studentRows, count: studentCount },
    { count: attendanceCount },
    { data: paidPayments },
    { count: smsSentCount },
  ] = await Promise.all([
      admin
        .from('teachers')
        .select('id, username, name, phone, email, address, gender, education_qualification, is_active, is_profile_complete, last_login_at, created_at')
        .eq('id', id)
        .is('deleted_at', null)
        .single(),
      admin
        .from('subscriptions')
        .select('status, plan_code, current_period_start, current_period_end, cancelled_at, override_reason')
        .eq('teacher_id', id)
        .maybeSingle(),
      admin
        .from('teacher_sessions')
        .select('device_id, device_info, is_active, last_seen_at')
        .eq('teacher_id', id)
        .order('last_seen_at', { ascending: false })
        .limit(10),
      admin
        .from('duplicate_token_attempts')
        .select('attempted_device_id, attempted_device_info, attempted_at')
        .eq('teacher_id', id)
        .order('attempted_at', { ascending: false })
        .limit(20),
      admin
        .from('teacher_tokens')
        .select('bound_device_id, bound_at')
        .eq('teacher_id', id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // --- Teaching data (for the Summary section) ---
      admin
        .from('classes')
        .select('id, subject, grade, batch, class_type, monthly_fee_cents, is_active', { count: 'exact' })
        .eq('teacher_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200),
      admin
        .from('students')
        .select('class_id', { count: 'exact' })
        .eq('teacher_id', id)
        .is('deleted_at', null)
        .limit(5000),
      admin
        .from('attendance')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', id)
        .is('deleted_at', null),
      admin
        .from('payments')
        .select('amount_cents')
        .eq('teacher_id', id)
        .eq('status', 'paid')
        .is('deleted_at', null)
        .limit(10000),
      admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', id)
        .eq('channel', 'sms')
        .eq('status', 'sent')
        .is('deleted_at', null),
    ]);

  if (!teacher) notFound();

  // --- Derive summary figures ---
  const studentsByClass = new Map<string, number>();
  for (const s of studentRows ?? []) {
    studentsByClass.set(s.class_id, (studentsByClass.get(s.class_id) ?? 0) + 1);
  }
  const totalCollectedCents = (paidPayments ?? []).reduce(
    (sum, p) => sum + (p.amount_cents ?? 0),
    0,
  );
  const fmtRs = (cents: number) =>
    'Rs ' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const classTypeLabel = (t: string) => (t === 'al' ? 'A/L' : t === 'ol' ? 'O/L' : 'Other');

  const summaryStats: { label: string; value: string }[] = [
    { label: 'Classes', value: String(classCount ?? 0) },
    { label: 'Students', value: String(studentCount ?? 0) },
    { label: 'Attendance records', value: String(attendanceCount ?? 0) },
    { label: 'Payments collected', value: fmtRs(totalCollectedCents) },
    { label: 'SMS sent', value: String(smsSentCount ?? 0) },
  ];

  const fmt = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleString() : '—';

  return (
    <main className="container mx-auto max-w-4xl space-y-8 p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/teachers"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Teachers
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight font-mono">{teacher.username}</h1>
          {teacher.name && <p className="text-muted-foreground">{teacher.name}</p>}
        </div>
        <div className="flex items-center gap-3">
          <TeacherStatusBadge active={teacher.is_active} />
          <ToggleActiveButton teacherId={id} currentlyActive={teacher.is_active} />
        </div>
      </div>

      {/* Summary */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Summary</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summaryStats.map((stat) => (
            <div key={stat.label} className="rounded-lg border p-4">
              <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Classes breakdown */}
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Class</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Students</th>
                <th className="px-4 py-2 text-left font-medium">Monthly fee</th>
                <th className="px-4 py-2 text-left font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {!classes?.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No classes.</td>
                </tr>
              ) : (
                classes.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      {c.subject}
                      <span className="text-muted-foreground"> — Grade {c.grade} ({c.batch})</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{classTypeLabel(c.class_type)}</td>
                    <td className="px-4 py-2">{studentsByClass.get(c.id) ?? 0}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtRs(c.monthly_fee_cents)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium ${c.is_active ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Profile */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile</h2>
        <div className="rounded-lg border divide-y">
          {[
            ['Phone', teacher.phone],
            ['Email', teacher.email ?? '—'],
            ['Address', teacher.address ?? '—'],
            ['Gender', teacher.gender ?? '—'],
            ['Qualification', teacher.education_qualification ?? '—'],
            ['Profile complete', teacher.is_profile_complete ? 'Yes' : 'No'],
            ['Last login', fmt(teacher.last_login_at)],
            ['Created', fmt(teacher.created_at)],
          ].map(([label, value]) => (
            <div key={label} className="flex px-4 py-3 text-sm">
              <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Subscription */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Subscription</h2>
        {sub && (sub.status === 'active' || sub.status === 'trialing') && (
          sub.override_reason ? (
            <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm">
              <span className="font-semibold text-blue-700">Free grant (admin)</span>
              <span className="ml-2 text-blue-600">— given by admin, no Stripe payment. Reason: {sub.override_reason}</span>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm">
              <span className="font-semibold text-emerald-700">Paid (Stripe)</span>
              <span className="ml-2 text-emerald-600">— teacher pays with real money. Cancel in Stripe, not here.</span>
            </div>
          )
        )}
        <div className="rounded-lg border divide-y">
          {sub ? (
            <>
              {[
                ['Status', sub.status],
                ['Plan', sub.plan_code],
                ['Period start', fmt(sub.current_period_start)],
                ['Period end', fmt(sub.current_period_end)],
                ['Cancelled at', fmt(sub.cancelled_at)],
              ].map(([label, value]) => (
                <div key={label} className="flex px-4 py-3 text-sm">
                  <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
              <div className="flex px-4 py-3 text-sm">
                <span className="w-40 shrink-0 text-muted-foreground">Time left</span>
                <TrialCountdown periodEnd={sub.current_period_end} status={sub.status} />
              </div>
            </>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">No subscription record.</p>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Manual Override</p>
          <SubscriptionActions
            teacherId={id}
            currentSubStatus={sub?.status ?? null}
            periodEnd={sub?.current_period_end ?? null}
          />
        </div>
      </section>

      {/* Data Backup & Restore */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Data Backup &amp; Restore
        </h2>
        <div className="rounded-lg border p-4">
          <TeacherDataBackup teacherId={id} username={teacher.username} />
        </div>
      </section>

      {/* Reset Password */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Password Reset
        </h2>
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            If the teacher has forgotten their password, generate a new one here.
            The new password is shown <strong>once</strong> — share it securely.
            The teacher should change it immediately from Settings → Change Password.
          </p>
          <ResetPasswordButton teacherId={id} username={teacher.username} />
        </div>
      </section>

      {/* Force Sign-Out */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Force Sign-Out
        </h2>
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Signs the teacher out of all devices (e.g. a lost or stolen phone).
            No token is needed: the teacher logs back in with their username and
            password, and the new phone is bound automatically. For a normal phone
            upgrade the teacher can do this themselves — they don&apos;t need you.
            If the password may be compromised, also use <strong>Reset Password</strong>.
          </p>
          <ResetDeviceButton
            teacherId={id}
            username={teacher.username}
            boundDeviceId={activeToken?.bound_device_id ?? null}
          />
        </div>
      </section>

      {/* Impersonate */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Impersonate (Debug)
        </h2>
        <div className="rounded-lg border p-4">
          <ImpersonateButton teacherId={id} />
        </div>
      </section>

      {/* Active Sessions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Active Sessions
        </h2>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Device ID</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {!sessions?.length ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No sessions.</td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.device_id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{s.device_id}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium ${s.is_active ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{fmt(s.last_seen_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Duplicate Token Attempts */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Duplicate Token Attempts
          {!!dupAttempts?.length && (
            <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
              {dupAttempts.length}
            </span>
          )}
        </h2>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Device ID</th>
                <th className="px-4 py-2 text-left font-medium">Attempted At</th>
              </tr>
            </thead>
            <tbody>
              {!dupAttempts?.length ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">No attempts.</td>
                </tr>
              ) : (
                dupAttempts.map((a, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{a.attempted_device_id}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmt(a.attempted_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
