'use client';

import { useEffect, useState } from 'react';

interface Props {
  /** ISO timestamp the trial / paid period ends. */
  periodEnd: string | null;
  /** Subscription status — only 'trialing' / 'active' get a live countdown. */
  status: string | null;
}

function describe(msLeft: number): { text: string; tone: 'ok' | 'warn' | 'expired' } {
  if (msLeft <= 0) return { text: 'Expired', tone: 'expired' };

  const totalMinutes = Math.floor(msLeft / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  let text: string;
  if (days > 0) text = `${days}d ${hours}h left`;
  else if (hours > 0) text = `${hours}h ${minutes}m left`;
  else text = `${minutes}m left`;

  // Warn when under 2 days remain.
  const tone = msLeft < 2 * 24 * 60 * 60 * 1000 ? 'warn' : 'ok';
  return { text, tone };
}

export function TrialCountdown({ periodEnd, status }: Props) {
  const [now, setNow] = useState(() => Date.now());

  // Tick every minute so the countdown stays current without a refresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!periodEnd || (status !== 'trialing' && status !== 'active')) {
    return <span className="text-muted-foreground">—</span>;
  }

  const msLeft = new Date(periodEnd).getTime() - now;
  const { text, tone } = describe(msLeft);

  const cls =
    tone === 'expired'
      ? 'text-destructive'
      : tone === 'warn'
        ? 'text-amber-600'
        : 'text-emerald-600';

  const label = status === 'trialing' ? 'Trial' : 'Plan';

  return (
    <span className={`font-medium ${cls}`}>
      {tone === 'expired' ? `${label} expired` : text}
    </span>
  );
}
