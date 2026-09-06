import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StorageTab } from './storage-tab';
import { TokenAttemptsTab } from './token-attempts-tab';
import { SmsTab } from './sms-tab';

const TABS = ['storage', 'token-attempts', 'sms'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  storage: 'R2 Storage',
  'token-attempts': 'Token Attempts',
  sms: 'SMS Usage',
};

interface PageProps {
  searchParams: { tab?: string; sms_status?: string; from?: string; to?: string };
}

const SMS_STATUSES = ['all', 'sent', 'failed', 'queued', 'delivered', 'cancelled'] as const;
type SmsStatusFilter = (typeof SMS_STATUSES)[number];

/** YYYY-MM-DD for an offset of N days ago (local). */
function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

interface StorageRow {
  teacher_id: string;
  username: string;
  name: string | null;
  file_count: number;
  total_bytes: number;
}

interface SmsRow {
  teacher_id: string;
  username: string;
  name: string | null;
  sent: number;
  failed: number;
  queued: number;
}

interface TokenAttempt {
  teacher_id: string;
  attempted_device_id: string;
  attempted_at: string;
  teachers: { username: string; name: string | null } | null;
}

export interface SmsMessageRow {
  id: string;
  teacher_id: string;
  recipient_phone: string;
  body: string;
  status: string;
  error: string | null;
  retry_count: number;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  teachers: { username: string; name: string | null } | null;
}

export default async function MonitoringPage({ searchParams }: PageProps) {
  const activeTab: Tab = (TABS as readonly string[]).includes(searchParams.tab ?? '')
    ? (searchParams.tab as Tab)
    : 'storage';

  const supabase = createClient();
  const admin = createAdminClient();

  // --- SMS log filters (status + date range) ---
  const smsStatus: SmsStatusFilter = (SMS_STATUSES as readonly string[]).includes(searchParams.sms_status ?? '')
    ? (searchParams.sms_status as SmsStatusFilter)
    : 'all';
  // Default window: last 30 days. Dates are inclusive (to-date covers the whole day).
  const fromDate = searchParams.from || isoDate(30);
  const toDate = searchParams.to || isoDate(0);

  let smsMsgQuery = admin
    .from('messages')
    .select('id, teacher_id, recipient_phone, body, status, error, retry_count, created_at, sent_at, failed_at, teachers(username, name)')
    .eq('channel', 'sms')
    .gte('created_at', `${fromDate}T00:00:00.000Z`)
    .lte('created_at', `${toDate}T23:59:59.999Z`)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (smsStatus !== 'all') smsMsgQuery = smsMsgQuery.eq('status', smsStatus);

  const [storageRes, smsRes, attemptsRes, smsMsgRes] = await Promise.all([
    supabase.rpc('get_storage_usage'),
    supabase.rpc('get_sms_usage', { days_back: 30 }),
    admin
      .from('duplicate_token_attempts')
      .select('teacher_id, attempted_device_id, attempted_at, teachers(username, name)')
      .order('attempted_at', { ascending: false })
      .limit(100),
    smsMsgQuery,
  ]);

  const storageRows = (storageRes.data ?? []) as StorageRow[];
  const smsRows = (smsRes.data ?? []) as SmsRow[];
  const attempts = (attemptsRes.data ?? []) as unknown as TokenAttempt[];
  const smsMessages = (smsMsgRes.data ?? []) as unknown as SmsMessageRow[];

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Monitoring</h1>

      {/* Tab bar */}
      <nav className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <Link
            key={tab}
            href={`/monitoring?tab=${tab}`}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[tab]}
            {tab === 'token-attempts' && attempts.length > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">
                {attempts.length}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === 'storage' && (
        <StorageTab rows={storageRows} error={storageRes.error?.message} />
      )}
      {activeTab === 'token-attempts' && (
        <TokenAttemptsTab attempts={attempts} error={attemptsRes.error?.message} />
      )}
      {activeTab === 'sms' && (
        <SmsTab
          rows={smsRows}
          messages={smsMessages}
          error={smsRes.error?.message}
          messagesError={smsMsgRes.error?.message}
          filter={{ status: smsStatus, from: fromDate, to: toDate }}
        />
      )}
    </main>
  );
}
