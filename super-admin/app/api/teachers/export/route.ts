import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Verify the caller is the super admin
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin.rpc('get_teacher_activity_list');

  if (error) {
    return new NextResponse(`RPC error: ${error.message}`, { status: 500 });
  }

  const headers = ['id', 'username', 'name', 'is_active', 'sub_status', 'last_login_at', 'student_count', 'payment_count', 'health_score'];
  const csvRows = [
    headers.join(','),
    ...(rows ?? []).map((r: Record<string, unknown>) =>
      headers
        .map((h) => {
          const v = r[h] ?? '';
          const s = String(v);
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    ),
  ];

  const csv = csvRows.join('\n');
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="teachers-${date}.csv"`,
    },
  });
}
