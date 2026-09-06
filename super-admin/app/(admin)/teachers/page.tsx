import Link from 'next/link';
import { UserPlus, Search } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TeachersBulkTable } from './bulk-actions';

interface PageProps {
  searchParams: { q?: string; health?: string; plan?: string };
}

// A teacher is "Pro" when their subscription is active or trialing; everything
// else (inactive, cancelled, past_due, incomplete, or no subscription) is Free.
function isProStatus(status: string | null): boolean {
  return status === 'active' || status === 'trialing';
}

interface TeacherActivity {
  id: string;
  username: string;
  name: string | null;
  is_active: boolean;
  sub_status: string | null;
  plan_code: string | null;
  last_login_at: string | null;
  student_count: number;
  payment_count: number;
  health_score: number;
}

// Package filter options. Values match subscription_plans.code, plus the
// special groups 'trial' (any package, still trialing) and 'free' (no access).
const PACKAGE_OPTIONS = [
  { value: 'all', label: 'All packages' },
  { value: 'starter', label: 'Starter' },
  { value: 'basic', label: 'Basic' },
  { value: 'growth', label: 'Growth' },
  { value: 'unlimited', label: 'Unlimited' },
  { value: 'trial', label: 'On free trial' },
  { value: 'free', label: 'No subscription' },
];

export default async function TeachersPage({ searchParams }: PageProps) {
  const supabase = createClient();
  const q = searchParams.q?.trim().toLowerCase() ?? '';
  const healthFilter = searchParams.health ?? 'all';
  const planFilter = searchParams.plan ?? 'all';

  const { data: raw, error } = await supabase.rpc('get_teacher_activity_list');
  let teachers: TeacherActivity[] = (raw as TeacherActivity[] | null) ?? [];

  if (q) {
    teachers = teachers.filter(
      (t) =>
        t.username.toLowerCase().includes(q) ||
        (t.name?.toLowerCase().includes(q) ?? false),
    );
  }

  if (healthFilter === 'hot')  teachers = teachers.filter((t) => t.health_score >= 70);
  if (healthFilter === 'warm') teachers = teachers.filter((t) => t.health_score >= 40 && t.health_score < 70);
  if (healthFilter === 'cold') teachers = teachers.filter((t) => t.health_score > 0  && t.health_score < 40);
  if (healthFilter === 'dead') teachers = teachers.filter((t) => t.health_score === 0);

  if (planFilter === 'pro') {
    teachers = teachers.filter((t) => isProStatus(t.sub_status)); // legacy bookmark links
  } else if (planFilter === 'free') {
    teachers = teachers.filter((t) => !isProStatus(t.sub_status));
  } else if (planFilter === 'trial') {
    teachers = teachers.filter((t) => t.sub_status === 'trialing');
  } else if (planFilter !== 'all') {
    // A specific package: only teachers with access on that plan.
    teachers = teachers.filter((t) => isProStatus(t.sub_status) && t.plan_code === planFilter);
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Teachers</h1>
        <Button asChild>
          <Link href="/teachers/new">
            <UserPlus className="mr-2 h-4 w-4" />
            New Teacher
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name or username…"
            className="pl-9"
          />
        </div>
        <select
          name="health"
          defaultValue={healthFilter}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All health</option>
          <option value="hot">Hot (≥70)</option>
          <option value="warm">Warm (40–69)</option>
          <option value="cold">Cold (1–39)</option>
          <option value="dead">Dead (0)</option>
        </select>
        <select
          name="plan"
          defaultValue={planFilter}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {PACKAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {error && (
        <p className="text-sm text-destructive">Failed to load teachers: {error.message}</p>
      )}

      <TeachersBulkTable teachers={teachers} />
    </main>
  );
}
