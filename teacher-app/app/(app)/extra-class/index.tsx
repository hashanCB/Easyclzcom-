// Extra Classes — list of one-off extra sessions, with a class filter.
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { useExtraClasses } from '../../../lib/extraClass/hooks';
import { ClassPicker } from '../../../components/ClassPicker';
import { useScreenTitle } from '../../../lib/ui/header';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

const FEE_LABEL: Record<string, string> = { free: 'Free', monthly: 'Monthly fee', custom: 'Special fee' };

export default function ExtraClassesScreen() {
  useScreenTitle('Extra Classes');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = buildStyles(colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? 'local');
  const classOptions = useClassOptions(teacherId);
  const [classId, setClassId] = useState<string | undefined>(undefined);
  const { items, refresh } = useExtraClasses({ teacherId, classId });

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  function classLabel(id: string): string {
    return classOptions.find((c) => c.id === id)?.label ?? '';
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.actions}>
        <Pressable onPress={() => router.push('/(app)/extra-class/new')} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </Pressable>
      </View>

      {classOptions.length > 0 && (
        <View style={[styles.filterWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <ClassPicker classes={classOptions} value={classId} onChange={setClassId} colors={colors} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={44} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No extra classes yet. Tap + to add one.</Text>
          </View>
        ) : (
          items.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => router.push({ pathname: '/(app)/extra-class/[id]', params: { id: e.id } })}
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
            >
              <View style={[styles.dateBox, { backgroundColor: '#4f46e518' }]}>
                <Ionicons name="flash-outline" size={20} color="#4f46e5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                  {e.topic || 'Extra class'}
                </Text>
                <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>{classLabel(e.classId)}</Text>
                <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                  {fmtDate(e.date)}{e.startTime ? `  ·  ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}  ·  {FEE_LABEL[e.feeMode] ?? e.feeMode}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    filterWrap: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
    scroll: { padding: 12, paddingBottom: 48 },
    empty: { alignItems: 'center', paddingVertical: 64, gap: 14, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8 },
    dateBox: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 15, fontWeight: '700' },
    cardSub: { fontSize: 12, marginTop: 2 },
    cardMeta: { fontSize: 12, marginTop: 3 },
  });
}
