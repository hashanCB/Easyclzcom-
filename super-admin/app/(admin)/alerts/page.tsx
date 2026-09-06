import { getSystemAlerts } from '@/app/actions/alerts';
import { AlertsList } from './alerts-list';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const alerts = await getSystemAlerts();
  const open = alerts.filter((a) => !a.resolved_at).length;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform problems that need your attention — SMS balance, send failures, health checks.
          {open > 0 ? ` ${open} open.` : ' All clear.'}
        </p>
      </div>

      <AlertsList alerts={alerts} />
    </div>
  );
}
