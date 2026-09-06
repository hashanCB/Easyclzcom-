'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, CreditCard, Activity,
  ScrollText, Settings, TrendingDown, Bell, Globe, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { logoutAction } from '@/app/actions/auth';

type NavItem = { href: string; label: string; Icon: LucideIcon };

// Grouped nav — sections give the long list a clear hierarchy.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
      { href: '/funnel',    label: 'Funnel',    Icon: TrendingDown },
    ],
  },
  {
    title: 'People',
    items: [
      { href: '/teachers',         label: 'Teachers', Icon: Users },
      { href: '/student-accounts', label: 'Students', Icon: GraduationCap },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { href: '/subscriptions', label: 'Subscriptions', Icon: CreditCard },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/monitoring', label: 'Monitoring', Icon: Activity },
      { href: '/alerts',     label: 'Alerts',     Icon: Bell },
      { href: '/audit',      label: 'Audit Log',  Icon: ScrollText },
      { href: '/website',    label: 'Website',    Icon: Globe },
      { href: '/settings',   label: 'Settings',   Icon: Settings },
    ],
  },
];

export function AdminNav({ alertCount }: { alertCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/30">
          E
        </div>
        <div className="leading-tight">
          <span className="block text-sm font-bold tracking-tight">Easyclz</span>
          <span className="block text-[11px] text-muted-foreground">Super Admin</span>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </p>
            {group.items.map(({ href, label, Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity',
                      active ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                  {href === '/alerts' && alertCount > 0 && (
                    <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
                      {alertCount > 99 ? '99+' : alertCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-border px-3 py-3">
        <div className="flex items-center justify-between rounded-lg px-3 py-1">
          <span className="text-xs font-medium text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
