interface Props {
  status: string;
}

const styles: Record<string, string> = {
  active:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  trialing:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  past_due:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  cancelled:  'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  incomplete: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  inactive:   'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

export function SubscriptionStatusBadge({ status }: Props) {
  const cls = styles[status] ?? styles.inactive;
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
