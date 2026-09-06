'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EnrollmentPicker } from '@/components/ui/EnrollmentPicker';
import { SuspendedBanner } from '@/components/ui/SuspendedBanner';
import { PendingPaymentBanner } from '@/components/ui/PendingPaymentBanner';
import { useEnrollments, markEnrollmentSuspended } from '@/lib/auth';
import { fetchStudentExtraClasses, lkr, type StudentExtraClass } from '@/lib/extraClass';
import { fetchStudentPayments, formatMonth, type StudentPayment } from '@/lib/payments';

function isSuspendedError(e: unknown): boolean {
  return (e as { code?: string })?.code === 'access_suspended';
}

export default function PaymentsPage() {
  const enrollments           = useEnrollments();
  const [selectedIdx, setIdx] = useState(0);
  const enrollment            = enrollments[selectedIdx];

  const [payments, setPayments] = useState<StudentPayment[]>([]);
  const [extras,   setExtras]   = useState<StudentExtraClass[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!enrollment?.token || enrollment.portal_active === false) return;
    setPayments([]);
    setExtras([]);
    setLoading(true);
    setError(null);
    // Extra classes (best-effort — never blocks the payment list).
    fetchStudentExtraClasses(enrollment.token).then(setExtras).catch(() => setExtras([]));
    fetchStudentPayments(enrollment.token)
      .then(setPayments)
      .catch((e: Error) => {
        if (isSuspendedError(e) && enrollment && markEnrollmentSuspended(enrollment.student_id)) {
          window.location.reload();
          return;
        }
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [enrollment?.token, enrollment?.portal_active]);

  const paid    = payments.filter((p) => p.status === 'paid').length;
  const partial = payments.filter((p) => p.status === 'partial').length;
  const unpaid  = payments.filter((p) => p.status === 'unpaid').length;

  return (
    <div className="space-y-5">

      <div>
        <h1 className="text-xl font-bold">Payment Status</h1>
        {enrollment && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {enrollment.subject} · {enrollment.teacher_username}
          </p>
        )}
      </div>

      <EnrollmentPicker enrollments={enrollments} selectedIdx={selectedIdx} onChange={setIdx} />

      {/* Extra classes */}
      {extras.length > 0 && (
        <div className="rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-bold">Extra Classes</p>
          </div>
          <div className="divide-y">
            {extras.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{x.topic || 'Extra class'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {x.date}{x.start_time ? ` · ${x.start_time}${x.end_time ? `–${x.end_time}` : ''}` : ''}{x.location ? ` · ${x.location}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {x.fee_mode === 'free' ? (
                    <span className="text-xs font-semibold text-muted-foreground">Free</span>
                  ) : !x.attended ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : x.owed_cents > 0 ? (
                    <span className="text-xs font-bold text-red-600">{lkr(x.owed_cents)} due</span>
                  ) : (
                    <span className="text-xs font-semibold text-green-600">Paid</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {enrollment?.portal_active === false ? (
        <SuspendedBanner teacherUsername={enrollment.teacher_username} fullBlock />
      ) : (<>

      {enrollment?.join_status === 'pending_payment' && (
        <PendingPaymentBanner teacherUsername={enrollment.teacher_username} />
      )}

      {/* Summary strip */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryTile label="Paid"    value={paid}    variant="success" />
          <SummaryTile label="Partial" value={partial} variant={partial > 0 ? 'warning' : 'muted'} />
          <SummaryTile label="Unpaid"  value={unpaid}  variant={unpaid  > 0 ? 'danger'  : 'muted'} />
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading payments…</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => {
              if (!enrollment?.token) return;
              setLoading(true); setError(null);
              fetchStudentPayments(enrollment.token)
                .then(setPayments).catch((e: Error) => setError(e.message))
                .finally(() => setLoading(false));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-card px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
          >
            <RefreshCcw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {!loading && !error && enrollments.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-muted p-8 text-center">
          <p className="text-sm font-semibold">No classes enrolled</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Join a class first to see your payment history.
          </p>
        </div>
      )}

      {!loading && !error && enrollments.length > 0 && payments.length === 0 && (
        <Card>
          <CardBody className="py-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-400" />
            <p className="font-semibold">No payments recorded yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {enrollment?.join_status === 'pending_payment'
                ? 'Your first payment will appear here once your teacher or assistant confirms it.'
                : 'Your teacher will record payments here each month.'}
            </p>
          </CardBody>
        </Card>
      )}

      {/* Payment list */}
      {!loading && !error && payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardBody className="divide-y py-1">
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} />
            ))}
          </CardBody>
        </Card>
      )}

      {enrollment && (
        <p className="text-center text-xs text-muted-foreground">
          For any payment question, contact {enrollment.teacher_username} directly.
        </p>
      )}

      </>)}
    </div>
  );
}

function PaymentRow({ payment }: { payment: StudentPayment }) {
  const configs = {
    paid:    { Icon: CheckCircle2, color: 'text-green-600', badge: 'success' as const,  label: 'Paid'    },
    partial: { Icon: MinusCircle,  color: 'text-yellow-600', badge: 'warning' as const, label: 'Partial' },
    unpaid:  { Icon: XCircle,      color: 'text-red-500',   badge: 'danger'  as const,  label: 'Unpaid'  },
  };
  const cfg = configs[payment.status] ?? configs.unpaid;
  const { Icon } = cfg;

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2.5">
        <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
        <div>
          <span className="text-sm font-medium">{formatMonth(payment.month)}</span>
          {payment.collected_at && (
            <p className="text-[11px] text-muted-foreground">
              Collected {new Date(payment.collected_at).toLocaleDateString('default', { day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
      </div>
      <Badge variant={cfg.badge}>{cfg.label}</Badge>
    </div>
  );
}

function SummaryTile({ label, value, variant }: {
  label: string;
  value: number;
  variant: 'muted' | 'success' | 'warning' | 'danger';
}) {
  const styles = {
    muted:   'bg-muted text-muted-foreground',
    success: 'bg-green-50 text-green-700',
    warning: 'bg-yellow-50 text-yellow-700',
    danger:  'bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-xl p-3 text-center ${styles[variant]}`}>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">{label}</p>
    </div>
  );
}
