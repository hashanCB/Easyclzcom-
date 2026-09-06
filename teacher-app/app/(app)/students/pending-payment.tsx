// Lists self-joined students who have not yet made their first payment (money
// gate). The teacher can tap a student to go to their profile and record a
// payment — that automatically promotes them to 'confirmed'.
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useScreenTitle } from '../../../lib/ui/header';

type Repo = typeof import('../../../db/repositories/studentsRepo').studentsRepo;
type Student = import('../../../db/schema/students').Student;

function getRepo(): Repo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../../db/repositories/studentsRepo').studentsRepo as Repo;
  } catch {
    return null;
  }
}

export default function PendingPaymentScreen() {
  useScreenTitle('Awaiting First Payment');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? '';

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    const repo = getRepo();
    if (!repo) { setLoading(false); return; }
    try {
      setStudents(repo.findPendingPayment(teacherId));
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>

      <View style={[styles.notice, { backgroundColor: '#f3e8ff', borderColor: '#e9d5ff' }]}>
        <Ionicons name="information-circle-outline" size={16} color="#7c3aed" />
        <Text style={styles.noticeText}>
          These students joined via class code. They won't appear in unpaid lists or money totals
          until their first payment is recorded by you or your assistant.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : students.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={44} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            All your students have cleared the payment gate.
          </Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); setRefreshing(false); }}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(app)/students/${item.id}` as never)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: '#7c3aed18' }]}>
                <Text style={[styles.avatarLetter, { color: '#7c3aed' }]}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {item.studentCode}
                  {item.grade ? ` · Grade ${item.grade}` : ''}
                  {item.batch ? ` · ${item.batch}` : ''}
                </Text>
                {item.studentPhone ? (
                  <Text style={[styles.phone, { color: colors.textMuted }]}>{item.studentPhone}</Text>
                ) : null}
              </View>
              <View style={styles.actionHint}>
                <Text style={styles.actionHintText}>Record payment</Text>
                <Ionicons name="chevron-forward" size={14} color="#7c3aed" />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      height: 56, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    notice: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      margin: 16, marginBottom: 0, padding: 12,
      borderRadius: 10, borderWidth: 1,
    },
    noticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: '#6d28d9' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 14,
      padding: 14, marginBottom: 10,
    },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { fontSize: 16, fontWeight: '700' },
    name: { fontSize: 15, fontWeight: '700' },
    meta: { fontSize: 12, marginTop: 2 },
    phone: { fontSize: 12, marginTop: 1 },
    actionHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    actionHintText: { fontSize: 11, fontWeight: '600', color: '#7c3aed' },
  });
}
