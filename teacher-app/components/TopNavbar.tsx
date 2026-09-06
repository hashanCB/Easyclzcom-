import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../lib/auth/store';
import { useThemeStore } from '../lib/theme/store';
import { useNotificationStore } from '../lib/notifications/store';
import { useHeaderStore } from '../lib/ui/header';
import { BackButton } from './ui/BackButton';

interface MenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export function TopNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  // Home is the only in-app root; every other screen gets a back button.
  const isHome = pathname === '/' || pathname === '/index';
  const [open, setOpen] = useState(false);
  const teacher = useAuthStore((s) => s.teacher);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { mode, colors, toggle } = useThemeStore(useShallow((s) => ({
    mode: s.mode,
    colors: s.colors,
    toggle: s.toggle,
  })));

  const unread = useNotificationStore((s) => s.unread);
  const screenTitle = useHeaderStore((s) => s.title);

  // Home shows the teacher's username; every sub-screen shows its own title.
  const barTitle = isHome ? (teacher?.username ?? 'Teacher') : (screenTitle ?? teacher?.username ?? '');

  const initials = (teacher?.username ?? 'T').slice(0, 1).toUpperCase();

  function go(path: string) {
    setOpen(false);
    router.push(path as never);
  }

  async function handleLogout() {
    setOpen(false);
    await clearAuth();
    router.replace('/(auth)/login');
  }

  const items: MenuItem[] = [
    { label: 'Profile Settings', onPress: () => go('/(app)/profile') },
    { label: 'Account Settings', onPress: () => go('/(app)/account') },
    { label: 'Backup & Restore', onPress: () => go('/(app)/backup') },
    { label: 'Subscription', onPress: () => go('/(app)/subscription') },
    { label: 'Help & Support', onPress: () => go('/(app)/support') },
    { label: 'Logout', onPress: handleLogout, destructive: true },
  ];

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}
    >
      {!isHome && (
        <BackButton color={colors.text} fallback="/(app)" style={styles.back} />
      )}

      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {barTitle}
      </Text>

      <Pressable
        onPress={() => router.push('/(app)/notifications' as never)}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        hitSlop={8}
        style={({ pressed }) => [styles.bell, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="notifications-outline" size={24} color={colors.text} />
        {unread > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Profile menu"
        style={({ pressed }) => [
          styles.avatar,
          { backgroundColor: colors.primary },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text style={[styles.avatarText, { color: colors.primaryText }]}>
          {initials}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={[
              styles.menu,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {items.slice(0, 5).map((it) => (
              <Pressable
                key={it.label}
                onPress={it.onPress}
                style={({ pressed }) => [
                  styles.menuItem,
                  { borderBottomColor: colors.border },
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <Text style={[styles.menuText, { color: colors.text }]}>
                  {it.label}
                </Text>
              </Pressable>
            ))}

            <View
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.menuText, { color: colors.text }]}>
                Dark Theme
              </Text>
              <Switch value={mode === 'dark'} onValueChange={() => toggle()} />
            </View>

            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.menuItem,
                styles.menuItemLast,
                pressed && { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <Text style={[styles.menuText, { color: colors.danger }]}>
                Logout
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { marginRight: 6 },
  title: { fontSize: 17, fontWeight: '600', flex: 1, marginRight: 12 },
  bell: { marginRight: 14, padding: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '700', fontSize: 15 },
  backdrop: { flex: 1, paddingTop: 64, paddingRight: 12, alignItems: 'flex-end' },
  menu: {
    minWidth: 220,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuText: { fontSize: 15, fontWeight: '500' },
});
