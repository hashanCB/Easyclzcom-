// Notification Center — the bell's list. Shows the teacher's recent
// notifications (chat, failed SMS, low balance, assistant activity, payments),
// newest first, with unread highlighting, tap-to-open, and "mark all read".
import React, { useCallback } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../lib/theme/store';
import { useAuthStore } from '../../lib/auth/store';
import { useScreenTitle } from '../../lib/ui/header';
import {
  useNotificationStore,
  type AppNotification,
  type NotificationType,
} from '../../lib/notifications/store';

// Icon + accent colour per notification type.
const TYPE_META: Record<NotificationType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  chat: { icon: 'chatbubble-ellipses', color: '#2563eb' },
  sms_failed: { icon: 'alert-circle', color: '#dc2626' },
  sms_low_balance: { icon: 'wallet', color: '#d97706' },
  payment: { icon: 'cash', color: '#059669' },
  assistant_attendance: { icon: 'checkbox', color: '#7c3aed' },
  join_request: { icon: 'person-add', color: '#7c3aed' },
  system: { icon: 'information-circle', color: '#0891b2' },
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function NotificationsScreen() {
  useScreenTitle('Notifications');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const token = useAuthStore((s) => s.session?.access_token) ?? '';

  const items = useNotificationStore((s) => s.items);
  const loading = useNotificationStore((s) => s.loading);
  const unread = useNotificationStore((s) => s.unread);
  const fetchNotifs = useNotificationStore((s) => s.fetch);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  useFocusEffect(useCallback(() => { if (token) void fetchNotifs(token); }, [token, fetchNotifs]));

  function handleTap(n: AppNotification) {
    if (!n.is_read && token) void markRead(token, n.id);
    // Route to the relevant screen when we have a target.
    if (n.type === 'chat' && typeof n.data?.thread_id === 'string') {
      router.push({ pathname: '/(app)/chat/[id]', params: { id: n.data.thread_id as string } });
    }
  }

  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>
      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => { if (token) void markAllRead(token); }}
          hitSlop={8}
          disabled={unread === 0}
          style={({ pressed }) => [styles.markAll, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.markAllText, { color: unread === 0 ? colors.textMuted : colors.primary }]}>
            Mark all
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => { if (token) void fetchNotifs(token); }} />
        }
      >
        {items.length === 0 && !loading && (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              New messages, failed SMS, payments and assistant activity will show up here.
            </Text>
          </View>
        )}

        {items.map((n) => {
          const meta = TYPE_META[n.type] ?? TYPE_META.system;
          return (
            <Pressable
              key={n.id}
              onPress={() => handleTap(n)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: n.is_read ? colors.surface : colors.primary + '0E',
                  borderColor: colors.border,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: meta.color + '1A' }]}>
                <Ionicons name={meta.icon} size={18} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text
                    style={[styles.rowTitle, { color: colors.text, fontWeight: n.is_read ? '600' : '800' }]}
                    numberOfLines={1}
                  >
                    {n.title}
                  </Text>
                  <Text style={[styles.rowTime, { color: colors.textMuted }]}>{timeAgo(n.created_at)}</Text>
                </View>
                <Text style={[styles.rowBody, { color: colors.textMuted }]} numberOfLines={2}>
                  {n.body}
                </Text>
              </View>
              {!n.is_read && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 6,
    },
    markAll: { alignItems: 'flex-end', paddingVertical: 6 },
    markAllText: { fontSize: 13, fontWeight: '600' },

    scroll: { padding: 12, paddingBottom: 48 },

    empty: { alignItems: 'center', paddingVertical: 80, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '700' },
    emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 8,
    },
    iconBox: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginBottom: 3,
    },
    rowTitle: { flex: 1, fontSize: 14 },
    rowTime: { fontSize: 11 },
    rowBody: { fontSize: 12, lineHeight: 17 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  });
}
