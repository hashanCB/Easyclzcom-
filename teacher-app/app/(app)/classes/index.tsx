import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { useClassesList } from '../../../lib/classes/hooks';
import { formatClassScheduleLabel } from '../../../lib/classes/formatDays';
import type { Class } from '../../../db/schema/classes';
import { useScreenTitle } from '../../../lib/ui/header';

function matches(c: Class, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    c.classType.toLowerCase().includes(needle) ||
    c.grade.toLowerCase().includes(needle) ||
    c.subject.toLowerCase().includes(needle) ||
    c.batch.toLowerCase().includes(needle) ||
    c.language.toLowerCase().includes(needle) ||
    (c.customClassType ?? '').toLowerCase().includes(needle)
  );
}

export default function ClassesListScreen() {
  useScreenTitle('Classes');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { classes, loading, refresh, isWeb } = useClassesList();
  const [q, setQ] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(() => classes.filter((c) => matches(c, q)), [classes, q]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/(app)/classes/new')}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel="Create new class"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={colors.primaryText} />
          <Text style={[styles.addBtnText, { color: colors.primaryText }]}>New</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by type, grade, subject, batch…"
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {isWeb ? (
        <View style={styles.emptyState}>
          <Ionicons name="phone-portrait-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Mobile only</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Local database is mobile-only. Open the app on a device to manage classes.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name={classes.length === 0 ? 'school-outline' : 'search-outline'}
            size={48}
            color={colors.border}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {classes.length === 0 ? 'No classes yet' : 'No matches'}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {classes.length === 0
              ? 'Tap "New" to create your first class.'
              : 'Try different search terms.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(app)/classes/${item.id}`)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: item.isActive ? 1 : 0.55,
                },
                pressed && { backgroundColor: colors.surfaceAlt },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${item.subject} ${item.batch} class`}
            >
              <View style={styles.cardTop}>
                <View style={[styles.cardIconBox, { backgroundColor: '#4f46e5' + '18' }]}>
                  <Ionicons name="school-outline" size={18} color="#4f46e5" />
                </View>
                <View style={{ flex: 1 }}>
                  {/* Header: subject — location (e.g. "ICT - Main Hall"). */}
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.subject}{item.location ? ` - ${item.location}` : ''}
                  </Text>
                  {/* Detail line: type, grade, group (batch), language. */}
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                    {item.classType.toUpperCase()} · Grade {item.grade} · {item.batch} · {item.language}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                    {formatClassScheduleLabel(item.classDay, item.classSchedule, item.classStartTime, item.classEndTime)} · Rs{' '}
                    {(item.monthlyFeeCents / 100).toLocaleString()} / mo
                  </Text>
                </View>
                <Text
                  style={[
                    styles.badge,
                    {
                      color: item.isActive ? '#4f46e5' : colors.textMuted,
                      borderColor: item.isActive ? '#4f46e5' : colors.border,
                      backgroundColor: item.isActive ? '#4f46e5' + '12' : 'transparent',
                    },
                  ]}
                >
                  {item.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    minHeight: 44,
  },
  addBtnText: { fontWeight: '700', fontSize: 14 },

  // Search bar
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    marginBottom: 12,
    gap: 8,
  },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 15 },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 260 },

  // Cards
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardSub: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
