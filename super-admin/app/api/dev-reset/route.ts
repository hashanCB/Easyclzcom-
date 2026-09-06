import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEV_REF = 'fxbfxfmtmmyuufqqddsu';

export async function POST() {
  // 1. Auth check — only signed-in super admin.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  // 2. DEV-only safety check — never runs on PROD.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!supabaseUrl.includes(DEV_REF)) {
    return NextResponse.json(
      { error: 'Reset is only allowed on the DEV project.' },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  // 3. Call the DB function — it deletes in FK-safe order and returns row counts.
  const { data: counts, error: rpcErr } = await admin.rpc('dev_reset_data');
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  // 4. Delete all auth.users EXCEPT the current super admin.
  let authDeleted = 0;
  let authErrors = 0;
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users ?? []) {
    if (u.id === user.id) continue;
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) authErrors++;
    else authDeleted++;
  }

  const total = counts
    ? Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0)
    : 0;

  return NextResponse.json({
    ok: true,
    reset_at: new Date().toISOString(),
    tables_cleared: counts,
    total_rows_deleted: total,
    auth_users_deleted: authDeleted,
    ...(authErrors ? { auth_errors: authErrors } : {}),
  });
}
