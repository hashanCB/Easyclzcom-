import { create } from 'zustand';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

const REST = `${SUPABASE_URL}/rest/v1`;

export type NotificationType =
  | 'chat'
  | 'sms_failed'
  | 'sms_low_balance'
  | 'payment'
  | 'assistant_attendance'
  | 'join_request'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

interface NotificationState {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  lastFetchedAt: number | null;

  fetch: (accessToken: string) => Promise<void>;
  markRead: (accessToken: string, id: string) => Promise<void>;
  markAllRead: (accessToken: string) => Promise<void>;
  clear: () => void;
}

function headers(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    ...extra,
  };
}

function countUnread(items: AppNotification[]): number {
  return items.reduce((n, it) => (it.is_read ? n : n + 1), 0);
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,
  loading: false,
  lastFetchedAt: null,

  // Pull the latest notifications. RLS restricts rows to the signed-in teacher,
  // so no teacher_id filter is needed. Best-effort: failures leave state intact.
  fetch: async (accessToken: string) => {
    if (!accessToken) return;
    set({ loading: true });
    try {
      const params = new URLSearchParams({
        select: 'id,type,title,body,data,is_read,read_at,created_at',
        order: 'created_at.desc',
        limit: '100',
      });
      const res = await fetch(`${REST}/notifications?${params}`, {
        headers: headers(accessToken, { Accept: 'application/json' }),
      });
      if (!res.ok) {
        set({ loading: false });
        return;
      }
      const rows = (await res.json()) as AppNotification[];
      set({ items: rows, unread: countUnread(rows), loading: false, lastFetchedAt: Date.now() });
    } catch {
      set({ loading: false });
    }
  },

  // Mark one as read. Optimistic: update locally first, then persist.
  markRead: async (accessToken: string, id: string) => {
    const prev = get().items;
    const next = prev.map((it) => (it.id === id ? { ...it, is_read: true } : it));
    set({ items: next, unread: countUnread(next) });
    try {
      await fetch(`${REST}/notifications?id=eq.${id}`, {
        method: 'PATCH',
        headers: headers(accessToken, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ is_read: true, read_at: new Date().toISOString() }),
      });
    } catch {
      // Leave the optimistic state; a later fetch reconciles.
    }
  },

  // Mark every unread one as read.
  markAllRead: async (accessToken: string) => {
    const prev = get().items;
    if (!prev.some((it) => !it.is_read)) return;
    const now = new Date().toISOString();
    const next = prev.map((it) => (it.is_read ? it : { ...it, is_read: true, read_at: now }));
    set({ items: next, unread: 0 });
    try {
      await fetch(`${REST}/notifications?is_read=eq.false`, {
        method: 'PATCH',
        headers: headers(accessToken, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ is_read: true, read_at: now }),
      });
    } catch {
      // Optimistic; reconciled on next fetch.
    }
  },

  clear: () => set({ items: [], unread: 0, loading: false, lastFetchedAt: null }),
}));
