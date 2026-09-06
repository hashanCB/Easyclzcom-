// Cloud Save History — shows the teacher a log of recent auto-saves.
// Local-only table (sync_log), max 30 entries, newest first.
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../lib/theme/store';
import { useScreenTitle } from '../../lib/ui/header';
import { syncLogRepo } from '../../db/repositories/syncLogRepo';
import type { SyncLogEntry } from '../../db/schema';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

function groupByDay(entries: SyncLogEntry[]): { day: string; items: SyncLogEntry[] }[] {
  const map = new Map<string, SyncLogEntry[]>();
  for (const e of entries) {
    const key = new Date(e.syncedAt).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).map(([, items]) => ({
    day: dayLabel(items[0]!.syncedAt),
    items,
  }));
}

/** Human-readable summary of what was saved */
function saveSummary(e: SyncLogEntry): string {
  const parts: string[] = [];
  if (e.classesPushed)    parts.push(`${e.classesPushed} class${e.classesPushed > 1 ? 'es' : ''}`);
  if (e.studentsPushed)   parts.push(`${e.studentsPushed} student${e.studentsPushed > 1 ? 's' : ''}`);
  if (e.paymentsPushed)   parts.push(`${e.paymentsPushed} payment${e.paymentsPushed > 1 ? 's' : ''}`);
  if (e.attendancePushed) parts.push(`${e.attendancePushed} attendance`);
  if (e.notesPushed)      parts.push(`${e.notesPushed} note${e.notesPushed > 1 ? 's' : ''}`);
  if (e.examsPushed)      parts.push(`${e.examsPushed} exam${e.examsPushed > 1 ? 's' : ''}`);
  if (e.marksPushed)      parts.push(`${e.marksPushed} mark${e.marksPushed > 1 ? 's' : ''}`);
  if (parts.length === 0) return 'Nothing new — already up to date';
  return parts.join(' · ');
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function SyncHistoryScreen() {
  useScreenTitle('Cloud Save History');
  const colors = useThemeStore((s) => s.colors);
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    try {
      setEntries(syncLogRepo.getRecent(30));
    } catch {
      setEntries([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function onRefresh() {
    setRefreshing(true);
    load();
    setRefreshing(false);
  }

  const groups = groupByDay(entries);
  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <Ionicons name="information-circle-outline" size={15} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.primary }]}>
            Your data saves to the cloud automatically every 5 minutes and when you reopen the app. Last 30 saves shown.
          </Text>
        </View>

        {/* Empty state */}
        {entries.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="cloud-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No save history yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Your data saves automatically every 5 minutes. History will appear here after the first save.
            </Text>
          </View>
        )}

        {/* Grouped entries */}
        {groups.map((group) => (
          <View key={group.day} style={{ marginBottom: 8 }}>
            {/* Day label */}
            <Text style={[styles.dayLabel, { color: colors.textMuted }]}>{group.day}</Text>

            {/* Entries card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {group.items.map((entry, idx) => {
                const isSuccess = entry.status === 'success';
                const isLast = idx === group.items.length - 1;
                return (
                  <View key={entry.id}>
                    <View style={styles.entryRow}>
                      {/* Icon */}
                      <View style={[
                        styles.iconBox,
                        { backgroundColor: isSuccess ? '#d1fae5' : '#fee2e2' },
                      ]}>
                        <Ionicons
                          name={isSuccess ? 'checkmark-circle' : 'cloud-offline-outline'}
                          size={16}
                          color={isSuccess ? '#059669' : '#dc2626'}
                        />
                      </View>

                      {/* Content */}
                      <View style={{ flex: 1 }}>
                        <View style={styles.entryTop}>
                          <Text style={[styles.entryStatus, {
                            color: isSuccess ? '#059669' : '#dc2626',
                          }]}>
                            {isSuccess ? 'Saved successfully' : 'Could not save'}
                          </Text>
                          <Text style={[styles.entryTime, { color: colors.textMuted }]}>
                            {formatTime(entry.syncedAt)}
                          </Text>
                        </View>
                        <Text style={[styles.entrySub, { color: colors.textMuted }]} numberOfLines={2}>
                          {isSuccess ? saveSummary(entry) : (entry.errorMessage ?? 'Unknown error')}
                        </Text>
                      </View>
                    </View>
                    {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {entries.length > 0 && (
          <Text style={[styles.footer, { color: colors.textMuted }]}>
            Showing last {entries.length} save{entries.length > 1 ? 's' : ''}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 32 },
    title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
    headerRight: { width: 32 },

    scroll: { padding: 16, paddingBottom: 48 },

    infoBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 10,
      borderWidth: 1,
      padding: 12,
      marginBottom: 20,
    },
    infoText: { flex: 1, fontSize: 12, lineHeight: 17 },

    empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '700' },
    emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

    dayLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    card: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 4,
    },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
    },
    iconBox: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    entryTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 3,
    },
    entryStatus: { fontSize: 13, fontWeight: '600' },
    entryTime:   { fontSize: 12 },
    entrySub:    { fontSize: 12, lineHeight: 17 },
    divider:     { height: StyleSheet.hairlineWidth, marginLeft: 56 },
    footer:      { fontSize: 11, textAlign: 'center', marginTop: 12 },
  });
}
