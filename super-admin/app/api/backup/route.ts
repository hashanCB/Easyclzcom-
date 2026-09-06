import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
// Backups can take a while on big datasets; give it room.
export const maxDuration = 60;

/** Every table to include in a full backup. Order is informational only. */
const TABLES = [
  // Core
  'teachers',
  'classes',
  'students',
  'student_credentials',
  'attendance',
  'exams',
  'marks',
  'payments',
  'payment_corrections',
  // Messaging
  'messages',
  'message_templates',
  'notes',
  'note_files',
  'chat_threads',
  'chat_messages',
  // Assistants
  'assistants',
  'assistant_class_permissions',
  // Student portal
  'student_accounts',
  'student_account_links',
  // Subscriptions / billing
  'subscriptions',
  'subscription_events',
  // Auth / sessions / security
  'teacher_sessions',
  'teacher_tokens',
  'duplicate_token_attempts',
  'user_roles',
  // Platform
  'app_settings',
  'audit_logs',
  'analytics_events',
  'system_alerts',
  'sync_state',
] as const;

const PAGE = 1000;

/** Fetch every row of a table, paging past the 1000-row PostgREST cap. */
async function dumpTable(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { rows };
}

export async function GET() {
  // Only the signed-in super admin may pull a full backup.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const admin = createAdminClient();

  const tables: Record<string, Record<string, unknown>[]> = {};
  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};

  // Sequential to avoid hammering the DB with many parallel full-table scans.
  for (const table of TABLES) {
    const { rows, error } = await dumpTable(admin, table);
    tables[table] = rows;
    counts[table] = rows.length;
    if (error) errors[table] = error;
  }

  const backup = {
    meta: {
      exported_at: new Date().toISOString(),
      exported_by: user.email ?? user.id,
      table_count: TABLES.length,
      row_counts: counts,
      ...(Object.keys(errors).length ? { errors } : {}),
    },
    tables,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="classpay-backup-${date}.json"`,
    },
  });
}
