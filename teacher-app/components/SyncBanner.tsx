import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../lib/theme/store';
import { useAuthStore } from '../lib/auth/store';
import { useSyncStore } from '../lib/sync/engine';
import { countUnsyncedChanges } from '../lib/sync/queue';
import { useIsPro } from '../lib/subscription/store';

// How often to re-count queued changes while the app is in the foreground.
// Local edits don't emit an event, so a light poll keeps the badge fresh.
// Counting is a handful of indexed COUNT(*) queries on local SQLite — cheap.
const POLL_MS = 8000;

const AMBER = '#f59e0b';

/**
 * Always-visible cloud-backup status bar shown under the top navbar on every
 * authenticated screen. It answers one question for the teacher: "is it safe to
 * close the app right now?"
 *
 *  • Hidden when everything is backed up (queued === 0) — stays out of the way.
 *  • "Backing up N changes…" while a push is in flight.
 *  • "Offline · N changes saved on this phone" when the cloud can't be reached.
 *  • "N changes waiting to back up · tap to back up now" otherwise.
 *
 * Tapping triggers an immediate sync (safe — the engine ignores overlapping
 * calls), giving teachers a manual "back up now" without any extra screen.
 */
export function SyncBanner() {
  const colors = useThemeStore((s) => s.colors);
  const teacherId = useAuthStore((s) => s.teacher?.id);
  const isPro = useIsPro();
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const [queued, setQueued] = useState(0);

  // Poll the queued-changes count on a light timer.
  useEffect(() => {
    if (Platform.OS === 'web' || !teacherId) {
      setQueued(0);
      return;
    }
    let cancelled = false;
    const recount = () => {
      const n = countUnsyncedChanges(teacherId);
      if (!cancelled) setQueued(n);
    };
    recount();
    const timer = setInterval(recount, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [teacherId]);

  // Re-count the instant a sync finishes so the badge drops to 0 right after a
  // successful backup (or reflects what's still stuck after a failed one).
  useEffect(() => {
    if (Platform.OS === 'web' || !teacherId) return;
    setQueued(countUnsyncedChanges(teacherId));
  }, [status, lastSyncedAt, teacherId]);

  // Free plan can't back up to the cloud — the backup is blocked and tapping
  // would do nothing. We already show the upgrade banner, so hide this entirely
  // to avoid a confusing "tap to back up now" that leads nowhere.
  if (!isPro) return null;

  // Nothing pending → no banner. (An error with nothing queued means there's
  // nothing for the teacher to worry about, so we stay hidden then too.)
  if (Platform.OS === 'web' || queued === 0) return null;

  const plural = queued === 1 ? 'change' : 'changes';

  let bg: string;
  let fg: string;
  let icon: keyof typeof Ionicons.glyphMap;
  let label: string;
  let spinner = false;

  if (status === 'syncing') {
    bg = colors.primary + '1a';
    fg = colors.primary;
    icon = 'cloud-upload-outline';
    label = `Backing up ${queued} ${plural}…`;
    spinner = true;
  } else if (status === 'error') {
    bg = AMBER + '22';
    fg = AMBER;
    icon = 'cloud-offline-outline';
    label = `Offline · ${queued} ${plural} saved on this phone, waiting to back up`;
  } else {
    bg = AMBER + '22';
    fg = AMBER;
    icon = 'cloud-upload-outline';
    label = `${queued} ${plural} waiting to back up · tap to back up now`;
  }

  return (
    <Pressable
      onPress={() => void useSyncStore.getState().sync()}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.bar, { backgroundColor: bg }, pressed && { opacity: 0.85 }]}
    >
      {spinner ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Ionicons name={icon} size={15} color={fg} />
      )}
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  text: { flex: 1, fontSize: 12.5, fontWeight: '600' },
});
