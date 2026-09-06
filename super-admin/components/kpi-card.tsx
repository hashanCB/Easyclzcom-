import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

const TONES: Record<Tone, string> = {
  primary:     'bg-primary/10 text-primary',
  success:     'bg-success/10 text-success',
  warning:     'bg-warning/15 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  muted:       'bg-muted text-muted-foreground',
};

interface KpiCardProps {
  title: string;
  value: string | number;
  sub?: string;
  Icon: LucideIcon;
  tone?: Tone;
}

export function KpiCard({ title, value, sub, Icon, tone = 'primary' }: KpiCardProps) {
  return (
    <div className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110',
            TONES[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
