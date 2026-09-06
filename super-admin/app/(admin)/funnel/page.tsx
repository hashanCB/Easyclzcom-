import { createClient } from '@/lib/supabase/server';

interface FunnelData {
  created: number;
  activated: number;
  has_class: number;
  has_student: number;
  has_payment: number;
}

const STAGES = [
  { key: 'created',     label: 'Account Created',    desc: 'Teacher shell row exists' },
  { key: 'activated',   label: 'First Login',         desc: 'Has logged in at least once' },
  { key: 'has_class',   label: 'Created a Class',     desc: 'Added ≥1 subject/class' },
  { key: 'has_student', label: 'Added a Student',     desc: 'Enrolled ≥1 student' },
  { key: 'has_payment', label: 'Recorded a Payment',  desc: 'Logged ≥1 payment' },
] as const;

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function dropPct(current: number, prev: number) {
  if (!prev) return 0;
  return Math.round(((prev - current) / prev) * 100);
}

export default async function FunnelPage() {
  const supabase = createClient();
  const { data: raw, error } = await supabase.rpc('get_onboarding_funnel');
  const funnel: FunnelData | null = error ? null : (raw as FunnelData);

  const values = funnel
    ? [funnel.created, funnel.activated, funnel.has_class, funnel.has_student, funnel.has_payment]
    : [0, 0, 0, 0, 0];

  const total = values[0] || 1;

  return (
    <main className="container mx-auto max-w-3xl space-y-8 p-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Onboarding Funnel</h1>
        <p className="text-sm text-muted-foreground">
          Where do teachers drop off between account creation and first payment?
        </p>
      </div>

      {error && (
        <p className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load funnel: {error.message}
        </p>
      )}

      <div className="space-y-3">
        {STAGES.map((stage, i) => {
          const count = values[i] ?? 0;
          const barWidth = pct(count, total);
          const drop = i > 0 ? dropPct(count, values[i - 1] ?? 0) : 0;

          return (
            <div key={stage.key} className="space-y-1">
              {/* Drop arrow between stages */}
              {i > 0 && (
                <div className="flex items-center gap-2 pl-2 text-xs text-muted-foreground">
                  <span>↓</span>
                  {drop > 0 ? (
                    <span className="text-destructive font-medium">−{drop}% dropped off here</span>
                  ) : (
                    <span>no drop-off</span>
                  )}
                </div>
              )}

              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <span className="font-medium">{stage.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{stage.desc}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-semibold tabular-nums">{count}</span>
                    <span className="ml-1 text-sm text-muted-foreground">
                      ({barWidth}%)
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary callout */}
      {funnel && funnel.created > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
          <p className="font-medium">Summary</p>
          <p className="text-muted-foreground">
            Of <strong>{funnel.created}</strong> teachers created,{' '}
            <strong>{funnel.activated}</strong> ({pct(funnel.activated, funnel.created)}%) have ever logged in,{' '}
            and <strong>{funnel.has_payment}</strong> ({pct(funnel.has_payment, funnel.created)}%) have recorded at least one payment.
          </p>
          {funnel.created - funnel.activated > 0 && (
            <p className="text-amber-600 font-medium">
              ⚠ {funnel.created - funnel.activated} teacher(s) have never logged in — consider follow-up.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
