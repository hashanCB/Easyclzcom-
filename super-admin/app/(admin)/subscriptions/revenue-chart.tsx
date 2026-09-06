'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface MonthlyRevenue {
  month_key: string;
  revenue_cents: number;
}

interface Props {
  data: MonthlyRevenue[];
}

function formatMonth(key: string) {
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1).toLocaleString('default', {
    month: 'short',
    year: '2-digit',
  });
}

function formatUSD(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function RevenueChart({ data }: Props) {
  const chartData = data.map((d) => ({
    month: formatMonth(d.month_key),
    revenue: d.revenue_cents / 100,
  }));

  if (data.every((d) => d.revenue_cents === 0)) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No payment events recorded yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v) => `$${v}`}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip
          formatter={(value) => [formatUSD(Number(value) * 100), 'Revenue']}
          cursor={{ fill: 'hsl(var(--muted))' }}
        />
        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
