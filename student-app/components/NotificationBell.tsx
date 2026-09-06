'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessagesSquare, ClipboardList, FileText, X, BellRing } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchNotifications,
  markNotificationRead,
  type StudentNotification,
} from '@/lib/notifications';
import { enablePush, isPushSubscribed, pushPermission } from '@/lib/push';

const POLL_MS = 60_000;

function iconFor(type: string) {
  if (type === 'chat') return MessagesSquare;
  if (type === 'exam') return ClipboardList;
  return FileText;
}

function routeFor(n: StudentNotification): string {
  if (n.type === 'chat') return '/chat';
  if (n.type === 'exam') return '/exams';
  return '/dashboard';
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState<StudentNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const { notifications, unread } = await fetchNotifications();
    setItems(notifications);
    setUnread(unread);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Decide whether to show the "turn on notifications" prompt inside the panel.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const perm = pushPermission();
      const subscribed = await isPushSubscribed();
      setShowPushPrompt(perm !== 'unsupported' && perm !== 'denied' && !subscribed);
    })();
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      // Optimistically clear the badge and persist.
      setUnread(0);
      setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
      await markNotificationRead();
    }
  }

  function handleItemClick(n: StudentNotification) {
    setOpen(false);
    router.push(routeFor(n));
  }

  async function handleEnablePush() {
    const ok = await enablePush();
    setShowPushPrompt(!ok);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {showPushPrompt && (
            <button
              onClick={handleEnablePush}
              className="flex w-full items-center gap-2 border-b bg-primary/5 px-4 py-2.5 text-left text-xs text-primary transition hover:bg-primary/10"
            >
              <BellRing className="h-4 w-4 flex-shrink-0" />
              <span>Turn on push notifications to get alerts on your phone.</span>
            </button>
          )}

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet.
              </p>
            ) : (
              items.map((n) => {
                const Icon = iconFor(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      'flex w-full items-start gap-3 border-b px-4 py-3 text-left transition hover:bg-muted/50',
                      !n.is_read && 'bg-primary/5',
                    )}
                  >
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
