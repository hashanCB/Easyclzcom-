'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Home, User, CreditCard, MessagesSquare, LogOut, QrCode, ClipboardList, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearSession, isLoggedIn, refreshGlobalSession } from '@/lib/auth';
import NotificationBell from '@/components/NotificationBell';
import ThemeToggle from '@/components/ThemeToggle';
import { ensureServiceWorker } from '@/lib/push';
// Each page manages its own selected enrollment via useEnrollments() + local state.

const NAV = [
  { href: '/dashboard', label: 'Home',     icon: Home },
  { href: '/qr',        label: 'My QR',    icon: QrCode },
  { href: '/exams',     label: 'Exams',    icon: ClipboardList },
  { href: '/payments',  label: 'Payments', icon: CreditCard },
  { href: '/notes',     label: 'Notes',    icon: BookOpen },
  { href: '/chat',      label: 'Chat',     icon: MessagesSquare },
  { href: '/profile',   label: 'Profile',  icon: User },
] as const;

// The phone tab bar fits ~6 tiles; Notes lives on the dashboard's Quick Access
// there, so keep it out of the mobile bottom bar (it's in the sidebar instead).
const MOBILE_NAV = NAV.filter((n) => n.href !== '/notes');

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Home',
  '/qr': 'My QR Code',
  '/exams': 'Exams',
  '/payments': 'Payments',
  '/notes': 'Notes',
  '/chat': 'Chat',
  '/profile': 'Profile',
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login');
      return;
    }

    // Sync enrollment status (suspend/restore/unlink) with the server on load
    // and whenever the tab regains focus, so all sides stay consistent.
    const sync = () => {
      refreshGlobalSession().then((changed) => {
        if (changed) window.location.reload();
      });
    };
    sync();

    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);

    // Register the push service worker (no permission prompt — that happens
    // later from the bell's "Turn on notifications" button).
    ensureServiceWorker();

    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [router]);

  function handleSignOut() {
    clearSession();
    router.push('/login');
  }

  const pageTitle = PAGE_TITLES[pathname] ?? 'Easyclz';

  return (
    <div className="min-h-dvh bg-background">

      {/* ── Sidebar (tablet + desktop, md and up) ── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card md:flex">
        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-sm shadow-primary/30">
            <span className="text-xs font-bold text-white">CP</span>
          </div>
          <div className="leading-tight">
            <span className="block text-sm font-bold tracking-tight text-foreground">Easyclz</span>
            <span className="block text-[11px] text-muted-foreground">Student Portal</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {/* Active accent bar */}
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer: theme + sign out */}
        <div className="space-y-1 border-t border-border px-3 py-3">
          <div className="flex items-center justify-between rounded-xl px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-h-dvh flex-col md:pl-64">

        {/* Mobile top bar (hidden once the sidebar appears) */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
              <span className="text-[10px] font-bold text-white">CP</span>
            </div>
            <span className="text-sm font-bold tracking-tight">Easyclz</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <button
              onClick={handleSignOut}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </header>

        {/* Desktop top bar — page title left, notification bell right */}
        <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-border bg-card/60 px-6 py-3.5 backdrop-blur-sm md:flex lg:px-8">
          <h1 className="text-base font-semibold tracking-tight text-foreground">{pageTitle}</h1>
          <NotificationBell />
        </header>

        {/* Page content — narrow on phones, comfortable centered column on desktop */}
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 pb-24 md:max-w-3xl md:px-6 md:py-7 md:pb-10 lg:max-w-5xl lg:px-8">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav (hidden once the sidebar appears) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-border bg-card/90 backdrop-blur-sm md:hidden">
        <div className="flex">
          {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition active:scale-95"
              >
                <div
                  className={cn(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                    active ? 'bg-primary/10' : 'bg-transparent',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-colors',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
                </div>
                <span className={cn('font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
