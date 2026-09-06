import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
// Restores can take a while on big datasets; give it room.
export const maxDuration = 60;

/**
 * Restore order = parents before children, so foreign keys resolve.
 * (e.g. a student needs its teacher + class to exist first.)
 */
const RESTORE_ORDER = [
  'teachers',
  'classes',
  'students',
  'student_credentials',
  'attendance',
  'exams',
  'marks',
  'payments',
  'payment_corrections',
  'messages',
  'message_templates',
  'notes',
  'note_files',
  'chat_threads',
  'chat_messages',
  'assistants',
  'assistant_class_permissions',
  'student_accounts',
  'student_account_links',
  'subscriptions',
  'subscription_events',
  'teacher_sessions',
  'teacher_tokens',
  'duplicate_token_attempts',
  'user_roles',
  'app_settings',
  'audit_logs',
  'analytics_events',
  'system_alerts',
  'sync_state',
] as const;

const BATCH = 500;

interface BackupFile {
  meta?: unknown;
  tables?: Record<string, Record<string, unknown>[]>;
}

export async function POST(request: Request) {
  // Only the signed-in super admin may restore.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  let body: BackupFile;
  try {
    body = (await request.json()) as BackupFile;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON file.' }, { status: 400 });
  }

  const tables = body?.tables;
  if (!tables || typeof tables !== 'object') {
    return NextResponse.json(
      { error: 'This file is not a valid backup (missing "tables").' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const restored: Record<string, number> = {};
  const errors: Record<string, string> = {};

  // Walk in dependency order. Unknown tables in the file are skipped.
  for (const table of RESTORE_ORDER) {
    const rows = tables[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    let ok = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      // merge-duplicates: existing rows (same primary key) are updated,
      // missing rows are inserted — so this is safe to run repeatedly.
      const { error } = await admin.from(table).upsert(chunk, { ignoreDuplicates: false });
      if (error) {
        errors[table] = error.message;
        break; // stop this table, move to the next
      }
      ok += chunk.length;
    }
    restored[table] = ok;
  }

  return NextResponse.json({
    ok: Object.keys(errors).length === 0,
    restored,
    ...(Object.keys(errors).length ? { errors } : {}),
    restored_at: new Date().toISOString(),
  });
}
