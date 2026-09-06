import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin-nav';
import { getUnresolvedAlertCount } from '@/app/actions/alerts';
import { getAppEnv } from '@/lib/app-env';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const alertCount = await getUnresolvedAlertCount().catch(() => 0);
  const env = getAppEnv();
  const isDev = env === 'dev';

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — sticky elevated surface with grouped nav + active states */}
      <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-border bg-card">
        <AdminNav alertCount={alertCount} />
      </aside>

      {/* Main content */}
      <div className="flex min-h-screen flex-1 flex-col overflow-x-hidden">
        {/* Environment bar — make it obvious whether this is test or live data */}
        <div
          className={[
            'sticky top-0 z-20 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold',
            isDev ? 'bg-warning text-warning-foreground' : 'bg-success text-success-foreground',
          ].join(' ')}
        >
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          {isDev
            ? 'DEV MODE — test data (easyclz-dev). Changes here do NOT affect real users.'
            : 'PRODUCTION — live data. Changes affect real teachers and students.'}
        </div>
        {children}
      </div>
    </div>
  );
}
