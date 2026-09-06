// Assistant class selector — entry point of the assistant app.
// Shows classes the assistant has permission for, with time-gate badges.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAssistantStore } from '../../lib/assistant/store';
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../../lib/theme/store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';
import { classIsOnDay, formatClassDays, getScheduleForDay } from '../../lib/classes/formatDays';
import { hydrateWorkingSet, readWorkingSet, clearWorkingSet } from '../../lib/assistant/workingSet';
import { writeCachedClasses } from '../../lib/assistant/classCache';
import { useOutboxStore } from '../../lib/assistant/outbox';
import { AttendanceFixSheet } from '../../components/AttendanceFixSheet';

interface ClassRow {
  id: string;
  grade: string;
  batch: string;
  subject: string;
  language: string;
  class_day: string;
  class_schedule: string | null;   // JSON per-day schedule
  class_start_time: string;        // fallback (first day's time)
  class_end_time: string;          // fallback (first day's time)
  qr_grace_minutes_before: number;
  location: string | null;
}

function todayDayName(): string {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    new Date().getDay()
  ];
}

function todayDateIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isWithinWindow(
  startTime: string,
  endTime: string,
  graceMinutes: number,
): boolean {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const openMins = sh * 60 + sm - graceMinutes;
  const closeMins = eh * 60 + em + 30; // 30-min grace after end
  return nowMins >= openMins && nowMins <= closeMins;
}

function timeLabel(startTime: string, endTime: string): string {
  function fmt(t: string) {
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  }
  return `${fmt(startTime)} – ${fmt(endTime)}`;
}

export default function AssistantHomeScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { profile, permissions, session, clearAuth, setPermissions } = useAssistantStore(useShallow((s) => ({
    profile: s.profile,
    permissions: s.permissions,
    session: s.session,
    clearAuth: s.clearAuth,
    setPermissions: s.setPermissions,
  })));

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Class ids whose data is downloaded and ready to scan offline.
  const [offlineReady, setOfflineReady] = useState<Set<string>>(new Set());
  // class_id → number of students marked today (read from the local snapshot).
  const [markedCounts, setMarkedCounts] = useState<Record<string, number>>({});
  // Which class's "Marked Today" correction sheet is open (null = closed).
  const [fixClassId, setFixClassId] = useState<string | null>(null);

  // Recompute today's marked counts from the cached working sets.
  const refreshCounts = useCallback((list: ClassRow[]) => {
    const today = todayDateIso();
    const counts: Record<string, number> = {};
    for (const c of list) {
      const ws = readWorkingSet(c.id);
      counts[c.id] = ws && ws.date === today ? Object.keys(ws.attendance).length : 0;
    }
    setMarkedCounts(counts);
  }, []);

  // Pending uploads waiting to reach the teacher (durable across app launches).
  const queued = useOutboxStore((s) => s.items.length);
  useEffect(() => { useOutboxStore.getState().hydrate(); }, []);

  const token = session?.access_token ?? '';
  const assistantId = profile?.id ?? session?.user.id ?? '';

  const load = useCallback(async () => {
    if (!token || !assistantId) { setClasses([]); setRefreshing(false); return; }
    try {
      // Re-fetch permissions first — the teacher may have assigned/removed
      // classes since this assistant logged in (the stored set is a login-time
      // snapshot). Keep the store in sync so session/summary screens match.
      let perms = permissions;
      try {
        const permRes = await fetch(
          `${SUPABASE_URL}/rest/v1/assistant_class_permissions?assistant_id=eq.${assistantId}&deleted_at=is.null&select=class_id,permission,can_add_student`,
          { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } },
        );
        if (permRes.ok) {
          const permData = await permRes.json().catch(() => null);
          if (Array.isArray(permData)) {
            perms = permData;
            await setPermissions(permData);
          }
        }
      } catch { /* keep existing perms on network error */ }

      if (perms.length === 0) { setClasses([]); return; }
      const ids = perms.map((p) => p.class_id).join(',');
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/classes?id=in.(${ids})&is_active=eq.true&deleted_at=is.null&select=id,grade,batch,subject,language,class_day,class_schedule,class_start_time,class_end_time,qr_grace_minutes_before,location`,
        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } },
      );
      const data = await res.json().catch(() => []);
      const activeClasses: ClassRow[] = Array.isArray(data) ? data : [];
      setClasses(activeClasses);

      // Cache class metadata so the add-student form can auto-fill fields offline.
      writeCachedClasses(
        activeClasses.map((c) => ({
          id: c.id,
          grade: c.grade,
          batch: c.batch,
          subject: c.subject,
          language: c.language,
        })),
      );

      // Prepare phase: while we're online, download each assigned class's data
      // (roster + today's attendance + this month's payments + fee) so the
      // assistant can scan it later at a dead-signal doorway. Fire-and-forget;
      // the "Saved for offline" badge updates as each one lands.
      const ready = new Set<string>();
      for (const c of activeClasses) if (readWorkingSet(c.id)) ready.add(c.id);
      setOfflineReady(new Set(ready));
      await Promise.all(
        activeClasses.map(async (c) => {
          const ws = await hydrateWorkingSet(c.id, token);
          if (ws.students.length > 0) ready.add(c.id);
        }),
      );
      setOfflineReady(new Set(ready));
      refreshCounts(activeClasses);
    } catch {
      Alert.alert('Error', 'Failed to load classes');
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, assistantId, setPermissions]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() { setRefreshing(true); load(); }

  async function handleLogout() {
    Alert.alert('Logout', 'Log out of assistant mode?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        // Drop every downloaded snapshot so the next account on this device
        // can't read this assistant's cached class data.
        permissions.forEach((p) => clearWorkingSet(p.class_id));
        await clearAuth();
        router.replace('/(auth)/login');
      } },
    ]);
  }

  const today = todayDayName();
  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.avatarBox, { backgroundColor: '#fffbeb' }]}>
            <Ionicons name="people-circle-outline" size={24} color="#f59e0b" />
          </View>
          <View>
            <Text style={[styles.headerName, { color: colors.text }]}>{profile?.name ?? 'Assistant'}</Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>@{profile?.username}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {queued > 0 && (
            <Pressable
              onPress={() => router.push('/(assistant)/queue')}
              hitSlop={8}
              accessibilityLabel={`${queued} uploads waiting — tap to view`}
              style={({ pressed }) => [styles.pendingPill, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="cloud-upload-outline" size={14} color="#d97706" />
              <Text style={styles.pendingPillText}>{queued} waiting</Text>
            </Pressable>
          )}
          <Pressable onPress={handleLogout} hitSlop={8} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {permissions.some((p) => p.can_add_student) && (
          <View style={styles.addRow}>
            <Pressable
              onPress={() => router.push('/(assistant)/add-student')}
              style={({ pressed }) => [styles.addBtn, { backgroundColor: '#f59e0b' }, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add Student</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(assistant)/my-students')}
              style={({ pressed }) => [styles.addBtn, styles.addBtnGhost, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="list-outline" size={18} color={colors.text} />
              <Text style={[styles.addBtnText, { color: colors.text }]}>My students</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={() => router.push('/(assistant)/extra-classes')}
          style={({ pressed }) => [styles.addBtn, styles.addBtnGhost, { borderColor: colors.border, marginBottom: 4 }, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="flash-outline" size={18} color="#d97706" />
          <Text style={[styles.addBtnText, { color: colors.text }]}>Extra Classes</Text>
        </Pressable>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SELECT A CLASS TO START</Text>

        {classes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No classes assigned. Ask your teacher to assign classes to your account.
            </Text>
          </View>
        ) : (
          classes.map((cls) => {
            const perm = permissions.find((p) => p.class_id === cls.id);
            const isToday = classIsOnDay(cls.class_day, today);
            // Use today's per-day schedule if available, else fall back to shared times
            const todaySched = getScheduleForDay(cls.class_schedule, today, cls.class_start_time, cls.class_end_time);
            const open = isToday && isWithinWindow(todaySched.start, todaySched.end, cls.qr_grace_minutes_before);

            return (
              <Pressable
                key={cls.id}
                onPress={() => {
                  if (!open) {
                    Alert.alert(
                      'Outside Class Window',
                      `This class is scheduled on ${formatClassDays(cls.class_day)}${isToday ? ` from ${timeLabel(todaySched.start, todaySched.end)}` : ''}.\n\nScanning opens ${cls.qr_grace_minutes_before} min before class.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Anyway', onPress: () => router.push({ pathname: '/(assistant)/session', params: { classId: cls.id, teacherId: profile?.teacher_id } }) },
                      ],
                    );
                  } else {
                    router.push({ pathname: '/(assistant)/session', params: { classId: cls.id, teacherId: profile?.teacher_id } });
                  }
                }}
                style={({ pressed }) => [
                  styles.classCard,
                  { backgroundColor: colors.surface, borderColor: open ? '#f59e0b' : colors.border, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                {/* Class info */}
                <View style={styles.classMain}>
                  <View style={[styles.classIconBox, { backgroundColor: open ? '#fffbeb' : colors.surfaceAlt }]}>
                    <Ionicons name="school-outline" size={22} color={open ? '#f59e0b' : colors.textMuted} />
                  </View>
                  <View style={styles.classInfo}>
                    <Text style={[styles.classPrimary, { color: colors.text }]}>
                      {cls.grade} · {cls.batch}
                    </Text>
                    <Text style={[styles.classSub, { color: colors.textMuted }]}>
                      {cls.subject} · {cls.language}
                    </Text>
                    <Text style={[styles.classSub, { color: colors.textMuted }]}>
                      {formatClassDays(cls.class_day)} · {timeLabel(cls.class_start_time, cls.class_end_time)}
                    </Text>
                    {cls.location && (
                      <Text style={[styles.classSub, { color: colors.textMuted }]}>{cls.location}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>

                {/* Badges row */}
                <View style={[styles.badgeRow, { borderTopColor: colors.border }]}>
                  <View style={[styles.badge, { backgroundColor: open ? '#d1fae5' : isToday ? '#fef3c7' : colors.surfaceAlt }]}>
                    <Ionicons
                      name={open ? 'checkmark-circle' : isToday ? 'time-outline' : 'calendar-outline'}
                      size={12}
                      color={open ? '#059669' : isToday ? '#d97706' : colors.textMuted}
                    />
                    <Text style={[styles.badgeText, { color: open ? '#059669' : isToday ? '#d97706' : colors.textMuted }]}>
                      {open ? 'Open now' : isToday ? 'Today — not yet open' : 'Not today'}
                    </Text>
                  </View>
                  {perm?.permission && (
                    <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name={perm.permission === 'attendance' ? 'checkbox-outline' : perm.permission === 'payment' ? 'card-outline' : 'checkmark-done-outline'} size={12} color={colors.textMuted} />
                      <Text style={[styles.badgeText, { color: colors.textMuted }]}>
                        {perm.permission === 'attendance' ? 'Attendance' : perm.permission === 'payment' ? 'Payment' : 'Attendance + Payment'}
                      </Text>
                    </View>
                  )}
                  {perm?.can_add_student && (
                    <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name="person-add-outline" size={12} color={colors.textMuted} />
                      <Text style={[styles.badgeText, { color: colors.textMuted }]}>Add students</Text>
                    </View>
                  )}
                  {offlineReady.has(cls.id) && (
                    <View style={[styles.badge, { backgroundColor: '#d1fae5' }]}>
                      <Ionicons name="cloud-done-outline" size={12} color="#059669" />
                      <Text style={[styles.badgeText, { color: '#059669' }]}>Saved for offline</Text>
                    </View>
                  )}
                  {markedCounts[cls.id] > 0 && (
                    <View style={[styles.badge, { backgroundColor: '#eff6ff' }]}>
                      <Ionicons name="people-outline" size={12} color="#2563eb" />
                      <Text style={[styles.badgeText, { color: '#2563eb' }]}>
                        {markedCounts[cls.id]} marked today
                      </Text>
                    </View>
                  )}
                </View>

                {/* Summary — view today's attendance + cash for this class (works offline) */}
                <Pressable
                  onPress={() => router.push({ pathname: '/(assistant)/summary', params: { classId: cls.id, teacherId: profile?.teacher_id } })}
                  style={({ pressed }) => [styles.fixBar, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="stats-chart-outline" size={15} color={colors.primary} />
                  <Text style={[styles.fixBarText, { color: colors.primary }]}>Summary</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                </Pressable>

                {/* Fix-attendance footer — correct a wrong mark without re-scanning */}
                {markedCounts[cls.id] > 0 && (
                  <Pressable
                    onPress={() => setFixClassId(cls.id)}
                    style={({ pressed }) => [
                      styles.fixBar,
                      { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Ionicons name="create-outline" size={15} color="#2563eb" />
                    <Text style={styles.fixBarText}>Fix attendance</Text>
                    <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Marked-today correction sheet (shared, single instance) */}
      <AttendanceFixSheet
        visible={fixClassId !== null}
        onClose={() => { setFixClassId(null); refreshCounts(classes); }}
        classId={fixClassId ?? ''}
        teacherId={profile?.teacher_id ?? ''}
        markedById={assistantId}
        token={token}
        onChanged={() => refreshCounts(classes)}
      />
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    headerName: { fontSize: 15, fontWeight: '700' },
    headerSub: { fontSize: 12 },
    logoutBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    pendingPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: '#fef3c7', borderRadius: 16,
      paddingHorizontal: 10, paddingVertical: 6,
    },
    pendingPillText: { fontSize: 12, fontWeight: '700', color: '#d97706' },

    scroll: { padding: 16, paddingBottom: 64 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 12,
    },
    addRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    addBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, height: 46, borderRadius: 12,
    },
    addBtnGhost: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth },
    addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    empty: { alignItems: 'center', paddingVertical: 60, gap: 16 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

    classCard: { borderWidth: 1.5, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
    classMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    classIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    classInfo: { flex: 1 },
    classPrimary: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    classSub: { fontSize: 12, marginTop: 1 },

    badgeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap' },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    badgeText: { fontSize: 11, fontWeight: '600' },

    fixBar: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    fixBarText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#2563eb' },
  });
}
