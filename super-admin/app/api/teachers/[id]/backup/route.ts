import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { TEACHER_BACKUP_TABLES } from '@/lib/teacher-backup-tables';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE = 1000;

/** Fetch every row of one teacher's slice of a table, paging past the 1000 cap. */
async function dumpTable(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  key: string,
  teacherId: string,
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .eq(key, teacherId)
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { rows };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  // Only the signed-in super admin may pull a teacher backup.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const teacherId = params.id;
  const admin = createAdminClient();

  // Confirm the teacher exists (and grab the username for the filename).
  const { data: teacher } = await admin
    .from('teachers')
    .select('username')
    .eq('id', teacherId)
    .maybeSingle();
  if (!teacher) return new NextResponse('Teacher not found', { status: 404 });

  const tables: Record<string, Record<string, unknown>[]> = {};
  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};

  for (const { table, key } of TEACHER_BACKUP_TABLES) {
    const { rows, error } = await dumpTable(admin, table, key, teacherId);
    tables[table] = rows;
    counts[table] = rows.length;
    if (error) errors[table] = error;
  }

  const backup = {
    meta: {
      kind: 'teacher-backup',
      teacher_id: teacherId,
      teacher_username: teacher.username,
      exported_at: new Date().toISOString(),
      exported_by: user.email ?? user.id,
      row_counts: counts,
      ...(Object.keys(errors).length ? { errors } : {}),
    },
    tables,
  };

  const date = new Date().toISOString().slice(0, 10);
  const safeName = String(teacher.username ?? 'teacher').replace(/[^a-zA-Z0-9_-]/g, '');
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="classpay-${safeName}-${date}.json"`,
    },
  });
}
