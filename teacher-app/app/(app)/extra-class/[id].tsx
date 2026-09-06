// Extra class detail — mark attendance, and collect the fee from students who
// attended a paid extra class. Only attendees owe; free-card students are free.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore, type ThemeColors } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import {
  useExtraClassRoster, markExtraAttendance, collectExtraPayment, deleteExtraClass,
  type ExtraRosterRow,
} from '../../../lib/extraClass/hooks';
import { newId } from '../../../lib/uuid';
import { useScreenTitle } from '../../../lib/ui/header';
import { extraClassMarkGate } from '../../../lib/classes/attendanceWindow';
import type { NewPayment } from '../../../db/schema';

function lkr(cents: number): string { return `Rs ${Math.round(cents / 100).toLocaleString()}`; }

export default function ExtraClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useScreenTitle('Extra Class');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = buildStyles(colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? 'local';
  const classOptions = useClassOptions(teacherId);
  const { extra, roster, loading, refresh } = useExtraClassRoster(id);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Same rule as regular attendance: only mark on the extra class's own date,
  // once its time window opens. Other days are view-only.
  const extraGate = extra ? extraClassMarkGate(extra.date, extra.startTime) : null;
  const canMarkExtra = extraGate?.ok === true;

  function setStatus(studentId: string, status: 'present' | 'absent') {
    if (!extra || !canMarkExtra) return;
    markExtraAttendance({ extraClassId: extra.id, classId: extra.classId, teacherId, studentId, date: extra.date, status });
    refresh();
  }

  function collect(row: ExtraRosterRow) {
    if (!extra || row.owedCents <= 0) return;
    Alert.alert('Collect payment', `Collect ${lkr(row.owedCents)} from ${row.student.name} for this extra class?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Collect',
        onPress: () => {
          const now = new Date().toISOString();
          const payload: NewPayment = {
            id: newId(),
            teacherId,
            studentId: row.student.id,
            classId: extra.classId,
            extraClassId: extra.id,
            month: extra.date.slice(0, 7),
            amountCents: row.owedCents,
            status: 'paid',
            method: 'cash',
            location: extra.location ?? null,
            remark: extra.topic ? `Extra class: ${extra.topic}` : 'Extra class',
            collectedByUserId: teacherId,
            collectedByRole: 'teacher',
            collectedAt: now,
            createdAt: now,
            updatedAt: now,
            clientUpdatedAt: now,
            syncedAt: null,
            deletedAt: null,
          };
          collectExtraPayment(payload);
          refresh();
        },
      },
    ]);
  }

  function remove() {
    Alert.alert('Delete extra class', 'Delete this extra class? Attendance stays, but the session is removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteExtraClass(id as string); router.back(); } },
    ]);
  }

  const classLabel = extra ? (classOptions.find((c) => c.id === extra.classId)?.label ?? '') : '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.actions}>
        <Pressable onPress={remove} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !extra || !roster ? (
        <View style={styles.center}><Text style={{ color: colors.textMuted }}>Not found.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Summary */}
          <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sumTitle, { color: colors.text }]}>{extra.topic || 'Extra class'}</Text>
            <Text style={[styles.sumSub, { color: colors.textMuted }]}>{classLabel}</Text>
            <Text style={[styles.sumSub, { color: colors.textMuted }]}>
              {extra.date}{extra.startTime ? `  ·  ${extra.startTime}${extra.endTime ? `–${extra.endTime}` : ''}` : ''}{extra.location ? `  ·  ${extra.location}` : ''}
            </Text>
            <View style={styles.statRow}>
              <Stat label="Present" value={`${roster.presentCount}`} colors={colors} />
              {roster.isPaid ? (
                <>
                  <Stat label="Collected" value={lkr(roster.collectedCents)} colors={colors} accent="#059669" />
                  <Stat label="Pending" value={lkr(roster.pendingCents)} colors={colors} accent={roster.pendingCents > 0 ? '#dc2626' : colors.textMuted} />
                </>
              ) : (
                <Stat label="Fee" value="Free" colors={colors} />
              )}
            </View>
          </View>

          {canMarkExtra ? (
            <Text style={[styles.count, { color: colors.textMuted }]}>Mark who attended, then collect from those present.</Text>
          ) : (
            <View style={[styles.noticeRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.noticeText, { color: colors.textMuted }]}>
                {extraGate && !extraGate.ok ? extraGate.message : 'Marking is closed.'} View only.
              </Text>
            </View>
          )}

          {roster.rows.map((row) => {
            const present = row.status === 'present' || row.status === 'late';
            const absent = row.status === 'absent';
            const fullyPaid = present && roster.isPaid && row.chargeCents > 0 && row.paidCents >= row.chargeCents;
            return (
              <View key={row.student.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{row.student.name}</Text>
                  <Text style={[styles.code, { color: colors.textMuted }]}>{row.student.studentCode}</Text>
                  {present && roster.isPaid ? (
                    <Text style={[styles.feeLine, { color: fullyPaid ? '#059669' : row.chargeCents === 0 ? colors.textMuted : '#d97706' }]}>
                      {row.chargeCents === 0 ? 'Free' : fullyPaid ? `Paid ${lkr(row.paidCents)}` : `Owes ${lkr(row.owedCents)}`}
                    </Text>
                  ) : null}
                </View>

                {/* Attendance toggle */}
                <View style={[styles.attendBtns, !canMarkExtra && { opacity: 0.4 }]}>
                  <Pressable disabled={!canMarkExtra} onPress={() => setStatus(row.student.id, 'present')} style={[styles.attBtn, present && { backgroundColor: '#d1fae5', borderColor: '#6ee7b7' }, { borderColor: present ? '#6ee7b7' : colors.border }]}>
                    <Text style={[styles.attText, { color: present ? '#059669' : colors.textMuted }]}>P</Text>
                  </Pressable>
                  <Pressable disabled={!canMarkExtra} onPress={() => setStatus(row.student.id, 'absent')} style={[styles.attBtn, absent && { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }, { borderColor: absent ? '#fca5a5' : colors.border }]}>
                    <Text style={[styles.attText, { color: absent ? '#dc2626' : colors.textMuted }]}>A</Text>
                  </Pressable>
                </View>

                {/* Collect */}
                {present && roster.isPaid && row.owedCents > 0 ? (
                  <Pressable onPress={() => collect(row)} style={[styles.collectBtn, { backgroundColor: colors.primary }]}>
                    <Text style={styles.collectText}>{lkr(row.owedCents)}</Text>
                  </Pressable>
                ) : fullyPaid ? (
                  <Ionicons name="checkmark-circle" size={22} color="#059669" />
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, colors, accent }: { label: string; value: string; colors: ThemeColors; accent?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: accent ?? colors.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 12, paddingBottom: 48 },
    summary: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, marginBottom: 12 },
    sumTitle: { fontSize: 16, fontWeight: '800' },
    sumSub: { fontSize: 12.5, marginTop: 3 },
    statRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    count: { fontSize: 12.5, marginBottom: 8, marginLeft: 2 },
    noticeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginBottom: 10, paddingVertical: 10, paddingHorizontal: 12,
      borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    },
    noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
    name: { fontSize: 14.5, fontWeight: '700' },
    code: { fontSize: 12, marginTop: 1 },
    feeLine: { fontSize: 12, fontWeight: '700', marginTop: 4 },
    attendBtns: { flexDirection: 'row', gap: 6 },
    attBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    attText: { fontSize: 14, fontWeight: '800' },
    collectBtn: { paddingHorizontal: 12, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 64 },
    collectText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  });
}
