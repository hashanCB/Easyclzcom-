import {
  Users,
  UserCheck,
  UserX,
  CreditCard,
  XCircle,
  DollarSign,
  LogOut,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
} from 'lucide-react';

import { logoutAction } from '@/app/actions/auth';
import { KpiCard } from '@/components/kpi-card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

interface KpiData {
  total_teachers: number;
  active_teachers: number;
  inactive_teachers: number;
  active_subs: number;
  cancelled_subs: number;
  monthly_revenue_cents: number;
}

interface BusinessMetrics {
  mrr_cents: number;
  active_count: number;
  trialing_count: number;
  past_due_count: number;
  cancelled_this_month: number;
  churn_rate_pct: number;
  failed_payments_count: number;
}

function fmtLKR(cents: number): string {
  return `LKR ${new Intl.NumberFormat('en-LK').format(Math.round(cents / 100))}`;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: kpiRaw, error },
    { data: bizRaw, error: bizError },
  ] = await Promise.all([
    supabase.rpc('get_admin_kpi'),
    supabase.rpc('get_business_metrics'),
  ]);

  const kpi: KpiData | null = error ? null : (kpiRaw as KpiData);
  const biz: BusinessMetrics | null = bizError ? null : (bizRaw as BusinessMetrics);

  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <main className="container mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as{' '}
            <span className="font-mono font-medium text-foreground">{user?.email ?? 'unknown'}</span>
          </p>
        </div>
        <form action={logoutAction}>
          <Button variant="outline" size="sm" type="submit">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </form>
      </header>

      {(error || bizError) && (
        <p className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load KPI data: {(error ?? bizError)?.message}
        </p>
      )}

      {/* ── Business Health ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Business Health — {monthLabel}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="MRR"
            value={biz ? fmtLKR(biz.mrr_cents) : '—'}
            sub="active + trialing subs"
            Icon={TrendingUp}
            tone="success"
          />
          <KpiCard
            title="Churn Rate"
            value={biz ? `${biz.churn_rate_pct}%` : '—'}
            sub={biz ? `${biz.cancelled_this_month} cancelled this month` : undefined}
            Icon={TrendingDown}
            tone="warning"
          />
          <KpiCard
            title="Failed Payments"
            value={biz?.failed_payments_count ?? '—'}
            sub="payment_failed events"
            Icon={AlertTriangle}
            tone="destructive"
          />
          <KpiCard
            title="Past Due"
            value={biz?.past_due_count ?? '—'}
            sub="awaiting retry"
            Icon={Clock}
            tone="warning"
          />
        </div>
      </section>

      {/* ── Teachers ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Teachers
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard title="Total Teachers" value={kpi?.total_teachers ?? '—'} Icon={Users} tone="primary" />
          <KpiCard title="Active Teachers" value={kpi?.active_teachers ?? '—'} Icon={UserCheck} tone="success" />
          <KpiCard title="Inactive Teachers" value={kpi?.inactive_teachers ?? '—'} Icon={UserX} tone="muted" />
        </div>
      </section>

      {/* ── Subscriptions ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Subscriptions
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            title="Active"
            value={biz?.active_count ?? kpi?.active_subs ?? '—'}
            Icon={CreditCard}
            tone="success"
          />
          <KpiCard
            title="Trialing"
            value={biz?.trialing_count ?? '—'}
            Icon={CreditCard}
            tone="primary"
          />
          <KpiCard
            title="Cancelled (all time)"
            value={kpi?.cancelled_subs ?? '—'}
            Icon={XCircle}
            tone="muted"
          />
        </div>
      </section>

      {/* ── Revenue ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Revenue
        </h2>
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <KpiCard
            title="Monthly Revenue (collected)"
            value={kpi ? formatCurrency(kpi.monthly_revenue_cents) : '—'}
            sub={monthLabel}
            Icon={DollarSign}
            tone="success"
          />
        </div>
      </section>
    </main>
  );
}
