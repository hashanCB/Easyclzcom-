'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookOpen, MessageCircle, CreditCard, ChevronRight, PauseCircle, KeyRound, Clock, XCircle, Wallet } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { useAccountName, useEnrollments, useGlobalSession, myJoinRequests, type Enrollment, type JoinRequest } from '@/lib/auth';

export default function DashboardPage() {
  const name        = useAccountName();
  const enrollments = useEnrollments();
  const global      = useGlobalSession();
  const [requests, setRequests] = useState<JoinRequest[]>([]);

  // Pending / recently rejected join requests, so the student knows where they stand.
  useEffect(() => {
    myJoinRequests()
      .then((all) => setRequests(all.filter((r) => r.status === 'pending' || r.status === 'rejected').slice(0, 5)))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">

      {/* Greeting hero — contained surface with the Join CTA built in */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardBody className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-3.5">
            <Avatar name={name || 'S'} emoji={global?.account.avatar_emoji ?? '🎓'} color={global?.account.avatar_color ?? 'blue'} size="lg" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Welcome back</p>
              <h2 className="truncate text-xl font-bold leading-tight sm:text-2xl">{name || '—'}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {enrollments.length} class{enrollments.length !== 1 ? 'es' : ''} enrolled
              </p>
            </div>
          </div>
          <Link
            href="/join-class"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition hover:bg-primary/90 active:scale-[0.98]"
          >
            <KeyRound className="h-4 w-4" />
            Join a Class
          </Link>
        </CardBody>
      </Card>

      {/* Join request status */}
      {requests.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Join Requests</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {requests.map((r) => <JoinRequestCard key={r.id} request={r} />)}
          </div>
        </section>
      )}

      {/* Per-teacher enrollment cards */}
      <section className="space-y-3">
        <SectionLabel>My Classes</SectionLabel>
        {enrollments.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {enrollments.map((e) => (
              <EnrollmentCard key={e.student_id} enrollment={e} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">No classes yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Get the class code from your teacher, then tap “Join a Class” above. Your teacher will accept your request.
            </p>
          </div>
        )}
      </section>

      {/* Quick navigation */}
      <section className="space-y-3">
        <SectionLabel>Quick Access</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickTile href="/payments" icon={<CreditCard className="h-5 w-5 text-primary" />}
            title="Payments" subtitle="Your payment status per teacher" />
          <QuickTile href="/notes"    icon={<BookOpen     className="h-5 w-5 text-primary" />}
            title="Notes"    subtitle="Download notes and files" />
          <QuickTile href="/chat"     icon={<MessageCircle className="h-5 w-5 text-primary" />}
            title="Chat"     subtitle="Message your teachers directly" />
        </div>
      </section>

    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
  );
}

function JoinRequestCard({ request: r }: { request: JoinRequest }) {
  const cls = r.class ? `${r.class.subject} · Grade ${r.class.grade} · ${r.class.batch}` : 'Class';
  const teacher = r.teacher?.name ?? r.teacher?.username ?? 'your teacher';

  if (r.status === 'rejected') {
    return (
      <Card className="border-danger/30 bg-danger-light/50">
        <CardBody className="flex items-center gap-3 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/15">
            <XCircle className="h-5 w-5 text-danger" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Request not accepted</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {cls} — check the code with {teacher} and try again
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border-warning/30 bg-warning-light/50">
      <CardBody className="flex items-center gap-3 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15">
          <Clock className="h-5 w-5 text-warning" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Waiting for approval</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {cls} — {teacher} will accept your request soon
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function EnrollmentCard({ enrollment: e }: { enrollment: Enrollment }) {
  const isSuspended = e.portal_active === false;
  const isPending   = e.join_status === 'pending_payment';

  if (isSuspended) {
    return (
      <Card className="border-warning/30 bg-warning-light/50">
        <CardBody className="flex items-center gap-3 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15">
            <PauseCircle className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Suspended from this class</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {e.subject} · {e.teacher_username} — contact your teacher to restore access
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (isPending) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardBody className="flex items-center gap-3 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{e.subject} — first payment pending</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {e.teacher_username} · Show your QR code to pay and activate
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="transition hover:border-primary/40 hover:shadow-md hover:shadow-primary/5">
      <CardBody className="flex items-center gap-3 py-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
          {e.subject.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{e.subject}</p>
          <p className="truncate text-xs text-muted-foreground">
            {e.teacher_username} · {e.grade} · {e.student_code}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function QuickTile({ href, icon, title, subtitle }: {
  href: string; icon: React.ReactNode; title: string; subtitle: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 active:scale-[0.99]">
        <CardBody className="flex items-center gap-3 py-3.5 sm:flex-col sm:items-start sm:gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted transition-colors group-hover:bg-primary/10">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="text-sm font-semibold leading-tight">{title}</p>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground sm:whitespace-normal">{subtitle}</p>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}
