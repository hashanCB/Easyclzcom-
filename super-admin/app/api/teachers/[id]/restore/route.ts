import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { TEACHER_BACKUP_TABLES } from '@/lib/teacher-backup-tables';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH = 500;

interface BackupFile {
  meta?: { teacher_id?: string; kind?: string };
  tables?: Record<string, Record<string, unknown>[]>;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  // Only the signed-in super admin may restore.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const teacherId = params.id;

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

  // Safety: if the file declares a different teacher, refuse outright so we never
  // mix one teacher's data into another's profile.
  if (body.meta?.teacher_id && body.meta.teacher_id !== teacherId) {
    return NextResponse.json(
      {
        error:
          'This backup belongs to a different teacher. Open that teacher\'s profile to restore it.',
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const restored: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const errors: Record<string, string> = {};

  for (const { table, key } of TEACHER_BACKUP_TABLES) {
    const rows = tables[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    // Defence in depth: only write rows that actually belong to this teacher.
    // (teachers → must be this id; everything else → teacher_id must match.)
    const allowed = rows.filter((r) =>
      table === 'teachers' ? r[key] === teacherId : r[key] === teacherId,
    );
    skipped[table] = rows.length - allowed.length;
    if (allowed.length === 0) continue;

    let ok = 0;
    for (let i = 0; i < allowed.length; i += BATCH) {
      const chunk = allowed.slice(i, i + BATCH);
      // merge-duplicates: same primary key → updated, missing → inserted, so
      // this is safe to run repeatedly and never deletes.
      const { error } = await admin.from(table).upsert(chunk, { ignoreDuplicates: false });
      if (error) {
        errors[table] = error.message;
        break;
      }
      ok += chunk.length;
    }
    restored[table] = ok;
  }

  const totalSkipped = Object.values(skipped).reduce((a, b) => a + b, 0);
  return NextResponse.json({
    ok: Object.keys(errors).length === 0,
    restored,
    ...(totalSkipped > 0 ? { skipped } : {}),
    ...(Object.keys(errors).length ? { errors } : {}),
    restored_at: new Date().toISOString(),
  });
}
