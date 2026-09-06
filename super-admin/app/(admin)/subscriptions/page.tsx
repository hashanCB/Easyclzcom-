import Link from 'next/link';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { SubscriptionStatusBadge } from '@/components/subscription-status-badge';
import { RevenueChart } from './revenue-chart';

interface PageProps {
  searchParams: { status?: string; plan?: string };
}

interface MonthlyRevenue {
  month_key: string;
  revenue_cents: number;
}

const STATUS_OPTIONS = ['all', 'active', 'trialing', 'past_due', 'cancelled', 'inactive', 'incomplete'];

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  basic: 'Basic',
  growth: 'Growth',
  unlimited: 'Unlimited',
  pro_monthly: 'Pro (legacy)',
  pro_override: 'Pro (grant)',
};

export default async function SubscriptionsPage({ searchParams }: PageProps) {
  const admin = createAdminClient();
  const supabase = createClient();
  const statusFilter = searchParams.status ?? 'all';
  const planFilter = searchParams.plan ?? 'all';

  let query = admin
    .from('subscriptions')
    .select(`
      id,
      status,
      plan_code,
      current_period_start,
      current_period_end,
      cancelled_at,
      created_at,
      teachers ( id, username, name, phone )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }
  if (planFilter !== 'all') {
    query = query.eq('plan_code', planFilter);
  }

  const [{ data: subs, error }, { data: chartRaw }] = await Promise.all([
    query,
    supabase.rpc('get_monthly_revenue', { months_back: 12 }),
  ]);

  const chartData: MonthlyRevenue[] = (chartRaw as MonthlyRevenue[] | null) ?? [];

  const fmt = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString() : '—';

  return (
    <main className="container mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Subscriptions</h1>

      {/* Revenue chart */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Monthly Revenue — Last 12 Months
        </h2>
        <div className="rounded-lg border bg-card p-4">
          <RevenueChart data={chartData} />
        </div>
      </section>

      {/* Filter */}
      <form className="flex flex-wrap gap-3 items-center">
        <select
          name="status"
          defaultValue={statusFilter}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
        <select
          name="plan"
          defaultValue={planFilter}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All packages</option>
          {Object.entries(PLAN_NAMES).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border bg-secondary px-3 py-2 text-sm hover:bg-secondary/80"
        >
          Filter
        </button>
      </form>

      {error && (
        <p className="text-sm text-destructive">Failed to load subscriptions: {error.message}</p>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Teacher</th>
              <th className="px-4 py-3 text-left font-medium">Plan</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Period End</th>
              <th className="px-4 py-3 text-left font-medium">Cancelled</th>
            </tr>
          </thead>
          <tbody>
            {!subs?.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No subscriptions found.
                </td>
              </tr>
            ) : (
              subs.map((s) => {
                const teacher = Array.isArray(s.teachers) ? s.teachers[0] : s.teachers;
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      {teacher ? (
                        <Link
                          href={`/teachers/${teacher.id}`}
                          className="text-primary underline-offset-4 hover:underline font-mono"
                        >
                          {teacher.username}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {teacher?.name && (
                        <span className="ml-2 text-muted-foreground">{teacher.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{PLAN_NAMES[s.plan_code] ?? s.plan_code}</td>
                    <td className="px-4 py-3">
                      <SubscriptionStatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(s.current_period_end)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(s.cancelled_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
