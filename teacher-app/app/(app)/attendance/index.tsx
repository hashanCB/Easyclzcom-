import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { useAttendanceSession, useCalendarMonth, markAttendance, type CalendarDayStat } from '../../../lib/attendance/hooks';
import { sendSms } from '../../../lib/messages/sms';
import { DEFAULT_BODIES, renderTemplate, type TemplateLanguage } from '../../../lib/messages/templates';
import { messageTemplatesRepo } from '../../../db/repositories/messageTemplatesRepo';
import { newId } from '../../../lib/uuid';
import { ClassPicker } from '../../../components/ClassPicker';
import { useScreenTitle } from '../../../lib/ui/header';
import { attendanceMarkGate, classMeetsToday, isToday } from '../../../lib/classes/attendanceWindow';
import type { Student } from '../../../db/schema/students';
import { logger } from '../../../lib/logger';

type AttendanceStatus = 'present' | 'absent' | 'late';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('default', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  present: { label: 'P', color: '#065f46', bg: '#d1fae5', icon: 'checkmark' },
  late:    { label: 'L', color: '#92400e', bg: '#fef3c7', icon: 'time-outline' },
  absent:  { label: 'A', color: '#991b1b', bg: '#fee2e2', icon: 'close' },
};

export default function MarkAttendanceScreen() {
  useScreenTitle('Mark Attendance');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const authSession = useAuthStore((s) => s.session);
  const teacherId = teacher?.id ?? 'local';

  const allClassOptions = useClassOptions(teacherId);
  // Only classes scheduled today can be marked, so the picker offers just those.
  const classOptions = useMemo(
    () => allClassOptions.filter((c) => classMeetsToday(c)),
    [allClassOptions],
  );
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(todayIso());

  // If the selected class is no longer one of today's classes (e.g. options
  // loaded, or midnight rolled over), drop the selection.
  React.useEffect(() => {
    if (classId && !classOptions.some((c) => c.id === classId)) setClassId('');
  }, [classId, classOptions]);
  const [viewMode, setViewMode] = useState<'list' | 'cal'>('list');
  const [calMonth, setCalMonth] = useState(() => todayIso().slice(0, 7));
  const [smsIntent, setSmsIntent] = useState(false);
  // Tracks (student+date) keys already SMSed this session to avoid resending.
  const smsSentRef = useRef<Set<string>>(new Set());
  // Tracks student IDs whose mark was just changed (shows "Edited" badge briefly).
  const [recentlyEdited, setRecentlyEdited] = useState<Set<string>>(new Set());
  const editTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const { session, loading, refresh } = useAttendanceSession(classId, date);
  const { dayStats, refresh: refreshCal } = useCalendarMonth(classId, calMonth);

  useFocusEffect(React.useCallback(() => { refresh(); refreshCal(); }, [refresh, refreshCal]));

  const styles = useMemo(() => buildStyles(colors), [colors]);

  const today = todayIso();
  const isFuture = date > today;

  // Marking is allowed only for TODAY, and only while the class's window is open
  // (opens at start − grace, closes at end of day). Other days are view-only.
  const selectedClass = classOptions.find((c) => c.id === classId);
  const markGate = selectedClass ? attendanceMarkGate(selectedClass) : null;
  const viewingToday = isToday(date);
  const canMark = !!classId && viewingToday && markGate?.ok === true;
  const markBlockedReason = !classId
    ? null
    : !viewingToday
      ? `Viewing ${date} — you can only mark today.`
      : markGate && !markGate.ok
        ? markGate.message
        : null;

  function navigateDate(newDate: string) {
    setDate(newDate);
    setCalMonth(newDate.slice(0, 7));
  }

  function shiftCalMonth(delta: number) {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (next > today.slice(0, 7)) return; // don't go past current month
    setCalMonth(next);
  }

  function selectCalDay(d: string) {
    setDate(d);
    setCalMonth(d.slice(0, 7));
    // refresh is triggered automatically via useEffect when date changes
  }

  const present  = [...session.marksMap.values()].filter((m) => m.status === 'present').length;
  const absent   = [...session.marksMap.values()].filter((m) => m.status === 'absent').length;
  const late     = [...session.marksMap.values()].filter((m) => m.status === 'late').length;
  const unmarked = session.students.length - session.marksMap.size;

  async function handleMarkAllPresent() {
    if (!canMark || session.students.length === 0) return;
    const unmarkedStudents = session.students.filter((s) => !session.marksMap.has(s.id));
    if (unmarkedStudents.length === 0) {
      Alert.alert('All marked', 'Every student already has attendance marked for this date.');
      return;
    }
    Alert.alert(
      'Mark All Present',
      `Mark ${unmarkedStudents.length} unmarked student${unmarkedStudents.length > 1 ? 's' : ''} as Present?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Present',
          onPress: () => {
            const now = new Date().toISOString();
            for (const student of unmarkedStudents) {
              try {
                markAttendance({
                  id: newId(),
                  teacherId,
                  studentId: student.id,
                  classId,
                  date,
                  status: 'present',
                  smsIntent: false,
                  smsSentAt: null,
                  markedByUserId: teacherId,
                  markedByRole: 'teacher',
                  deletedAt: null,
                  createdAt: now,
                  updatedAt: now,
                  clientUpdatedAt: now,
                  syncedAt: null,
                });
              } catch (e) { logger.warn('mark failed', e); }
            }
            refresh();
          },
        },
      ],
    );
  }

  async function handleMark(student: Student, status: AttendanceStatus) {
    if (!canMark) return;

    const currentMark = session.marksMap.get(student.id);
    const previousStatus = currentMark?.status as AttendanceStatus | undefined;

    // Tapping the already-active button is a no-op — avoids accidental SMS resends.
    if (previousStatus === status) return;

    const isCorrection = previousStatus !== undefined;
    const now = new Date().toISOString();
    try {
      markAttendance({
        id: newId(),
        teacherId,
        studentId: student.id,
        classId,
        date,
        status,
        smsIntent,
        smsSentAt: null,
        markedByUserId: teacherId,
        markedByRole: 'teacher',
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        clientUpdatedAt: now,
        syncedAt: null,
      });
      refresh();
    } catch (e) {
      logger.warn('mark failed', e);
      return;
    }

    // Show "Edited" flash badge for 2 s when correcting an existing mark.
    if (isCorrection) {
      setRecentlyEdited((prev) => new Set(prev).add(student.id));
      const existing = editTimers.current.get(student.id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        setRecentlyEdited((prev) => {
          const next = new Set(prev);
          next.delete(student.id);
          return next;
        });
        editTimers.current.delete(student.id);
      }, 2000);
      editTimers.current.set(student.id, t);
    }

    // Only send absence SMS when newly marking absent — not when correcting
    // from one absent status to another, and not on re-taps.
    if (status === 'absent' && smsIntent && previousStatus !== 'absent') {
      await sendAbsenceSms(student);
    }
  }

  async function sendAbsenceSms(student: Student) {
    const token = authSession?.access_token;
    if (!token) {
      Alert.alert('Not signed in', 'Please log in again to send SMS.');
      return;
    }
    const key = `${student.id}-${date}`;
    if (smsSentRef.current.has(key)) return; // already sent this session

    const phone = student.parentWhatsapp || student.parentMobile || student.studentPhone;
    if (!phone) {
      Alert.alert('No phone number', `${student.name} has no parent phone or WhatsApp on file.`);
      return;
    }

    try {
      const cls = classOptions.find((c) => c.id === classId);
      const lang = (student.language || 'english') as TemplateLanguage;
      const tmpl = await messageTemplatesRepo
        .findDefaultForType(teacherId, 'attendance_absent', lang)
        .catch(() => null);
      const body = tmpl?.body ?? DEFAULT_BODIES.attendance_absent;

      const rendered = renderTemplate(body, {
        parent_name: student.parentName || 'Parent',
        student_name: student.name,
        class_name: cls?.label ?? '',
        grade: cls?.grade ?? student.grade ?? '',
        batch: cls?.batch ?? student.batch ?? '',
        subject: cls?.subject ?? student.subject ?? '',
        teacher_name: teacher?.username ?? 'Teacher',
      });

      await sendSms(
        'attendance_absent',
        [{ recipient_phone: phone, body: rendered, student_id: student.id, class_id: classId }],
        token,
      );
      smsSentRef.current.add(key);
      Alert.alert('SMS sent', `Absence SMS sent to ${phone}.`);
    } catch (e: unknown) {
      Alert.alert('SMS failed', (e as Error).message);
    }
  }

  return (
    <View style={styles.container}>
      {/* Actions */}
      <View style={styles.actions}>
          <Pressable
            onPress={() => setViewMode((v) => v === 'cal' ? 'list' : 'cal')}
            hitSlop={8}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={viewMode === 'cal' ? 'Switch to list view' : 'Switch to calendar view'}
          >
            <Ionicons
              name={viewMode === 'cal' ? 'list-outline' : 'calendar-outline'}
              size={22}
              color={viewMode === 'cal' ? colors.primary : colors.text}
            />
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/attendance/reports')}
            hitSlop={8}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="View attendance reports"
          >
            <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
          </Pressable>
      </View>

      {/* Class selector */}
      <View style={styles.classPickerWrap}>
        <ClassPicker
          classes={classOptions}
          value={classId}
          onChange={(id) => setClassId(id ?? '')}
          colors={colors}
          allowAll={false}
          placeholder={classOptions.length === 0 ? 'No classes scheduled today' : 'Select a class'}
          title="Select a class"
        />
      </View>

      {viewMode === 'list' ? (
        /* Date picker — list mode */
        <View style={[styles.datePicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => navigateDate(addDays(date, -1))}
            style={({ pressed }) => [styles.dateArrow, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Previous day"
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>

          <Pressable onPress={() => navigateDate(today)} style={styles.dateCenter}>
            <Text style={[styles.dateText, { color: colors.text }]}>{formatDate(date)}</Text>
            {date !== today && (
              <Text style={[styles.todayHint, { color: colors.primary }]}>Tap to go to today</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => !isFuture && navigateDate(addDays(date, 1))}
            style={({ pressed }) => [styles.dateArrow, (isFuture || pressed) && { opacity: 0.3 }]}
            disabled={isFuture}
            accessibilityLabel="Next day"
          >
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </View>
      ) : (
        /* Calendar view */
        <AttendanceCalendar
          calMonth={calMonth}
          today={today}
          selectedDate={date}
          dayStats={dayStats}
          onShiftMonth={shiftCalMonth}
          onSelectDay={selectCalDay}
          colors={colors}
        />
      )}

      {/* Marking status — a reason when blocked, or a quick QR-scan shortcut. */}
      {classId && markBlockedReason && (
        <View style={[styles.noticeRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.noticeText, { color: colors.textMuted }]}>{markBlockedReason}</Text>
        </View>
      )}
      {canMark && (
        <Pressable
          onPress={() => router.push({ pathname: '/(app)/students/scan', params: { classId } })}
          style={({ pressed }) => [styles.scanBtn, { borderColor: colors.primary }, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="qr-code-outline" size={18} color={colors.primary} />
          <Text style={[styles.scanBtnText, { color: colors.primary }]}>Scan QR to mark</Text>
        </Pressable>
      )}

      {/* SMS toggle */}
      <View style={[styles.smsRow, { borderBottomColor: colors.border }]}>
        <View style={styles.smsLeft}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.smsLabel, { color: colors.textMuted }]}>Send SMS for absents</Text>
        </View>
        <Switch
          value={smsIntent}
          onValueChange={setSmsIntent}
          trackColor={{ true: colors.primary }}
          accessibilityLabel="Toggle SMS for absences"
        />
      </View>

      {/* Summary pills */}
      {classId && session.students.length > 0 && (
        <View style={styles.summary}>
          <SummaryPill label="Present"  count={present}  color="#065f46" bg="#d1fae5" />
          <SummaryPill label="Late"     count={late}     color="#92400e" bg="#fef3c7" />
          <SummaryPill label="Absent"   count={absent}   color="#991b1b" bg="#fee2e2" />
          <SummaryPill label="Unmarked" count={unmarked} color={colors.textMuted} bg={colors.surfaceAlt} />
        </View>
      )}

      {/* Mark All Present — only when marking is allowed (today + window open). */}
      {canMark && unmarked > 0 && (
        <Pressable
          onPress={handleMarkAllPresent}
          style={({ pressed }) => [
            styles.markAllBtn,
            { backgroundColor: '#d1fae5', borderColor: '#059669' },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Ionicons name="checkmark-done-circle-outline" size={18} color="#059669" />
          <Text style={styles.markAllText}>
            Mark All {unmarked} Unmarked as Present
          </Text>
        </Pressable>
      )}

      {/* Student list */}
      {!classId ? (
        <View style={styles.emptyState}>
          <Ionicons name={classOptions.length === 0 ? 'calendar-clear-outline' : 'school-outline'} size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {classOptions.length === 0 ? 'No class today' : 'Select a class'}
          </Text>
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {classOptions.length === 0
              ? 'You can only mark attendance on a class’s scheduled day. None of your classes meet today.'
              : 'Choose a class above to mark attendance.'}
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.emptyState}>
          <Text style={[styles.empty, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      ) : session.students.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color={colors.border} />
          <Text style={[styles.empty, { color: colors.textMuted }]}>No active students in this class.</Text>
        </View>
      ) : (
        <FlatList
          data={session.students}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }) => {
            const mark = session.marksMap.get(item.id);
            const currentStatus = mark?.status as AttendanceStatus | undefined;
            const isMarked = currentStatus !== undefined;
            const justEdited = recentlyEdited.has(item.id);
            return (
              <View style={[styles.studentRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <View style={styles.studentInfo}>
                  <View style={styles.studentNameRow}>
                    <Text style={[styles.studentName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    {isMarked && !justEdited && (
                      <Ionicons name="pencil-outline" size={12} color={colors.textMuted} style={styles.editHint} />
                    )}
                    {justEdited && (
                      <View style={styles.editedBadge}>
                        <Ionicons name="checkmark" size={11} color="#059669" />
                        <Text style={styles.editedText}>Updated</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.studentCode, { color: colors.textMuted }]}>{item.studentCode}</Text>
                </View>
                <View style={styles.statusBtns}>
                  {(['present', 'late', 'absent'] as AttendanceStatus[]).map((s) => {
                    const cfg = STATUS_CONFIG[s];
                    const active = currentStatus === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => handleMark(item, s)}
                        disabled={!canMark}
                        style={({ pressed }) => [
                          styles.statusBtn,
                          active
                            ? { backgroundColor: cfg.bg, borderColor: cfg.color }
                            : { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                          pressed && !active && { opacity: 0.7 },
                          !canMark && !active && { opacity: 0.4 },
                        ]}
                        accessibilityLabel={active ? `${item.name} is ${s} — tap another to change` : `Mark ${item.name} as ${s}`}
                      >
                        <Text style={[styles.statusBtnText, { color: active ? cfg.color : colors.textMuted }]}>
                          {cfg.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

// ── Calendar component ────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildCalendarGrid(month: string): Array<string | null> {
  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

function calMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function dayColor(stat: CalendarDayStat | undefined): { bg: string; dot: string } | null {
  if (!stat || stat.total === 0) return null;
  const pct = stat.present / stat.total;
  if (pct >= 0.8) return { bg: '#d1fae5', dot: '#059669' };
  if (pct >= 0.5) return { bg: '#fef3c7', dot: '#d97706' };
  return { bg: '#fee2e2', dot: '#dc2626' };
}

function AttendanceCalendar({
  calMonth, today, selectedDate, dayStats, onShiftMonth, onSelectDay, colors,
}: {
  calMonth: string;
  today: string;
  selectedDate: string;
  dayStats: Map<string, CalendarDayStat>;
  onShiftMonth: (delta: number) => void;
  onSelectDay: (d: string) => void;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  const cells = useMemo(() => buildCalendarGrid(calMonth), [calMonth]);
  const todayMonth = today.slice(0, 7);
  const isCurrentMonth = calMonth === todayMonth;

  return (
    <View style={[calStyles.wrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Month header */}
      <View style={calStyles.monthHeader}>
        <Pressable
          onPress={() => onShiftMonth(-1)}
          hitSlop={8}
          style={({ pressed }) => [calStyles.monthArrow, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <Text style={[calStyles.monthLabel, { color: colors.text }]}>{calMonthLabel(calMonth)}</Text>
        <Pressable
          onPress={() => onShiftMonth(1)}
          hitSlop={8}
          style={({ pressed }) => [calStyles.monthArrow, isCurrentMonth && { opacity: 0.25 }, pressed && { opacity: 0.5 }]}
          disabled={isCurrentMonth}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View style={calStyles.weekRow}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={[calStyles.weekDay, { color: colors.textMuted }]}>{d}</Text>
        ))}
      </View>

      {/* Day cells */}
      <View style={calStyles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={`empty-${i}`} style={calStyles.cell} />;
          const isFuture = cell > today;
          const isToday = cell === today;
          const isSelected = cell === selectedDate;
          const stat = dayStats.get(cell);
          const col = dayColor(stat);

          return (
            <Pressable
              key={cell}
              onPress={() => !isFuture && onSelectDay(cell)}
              disabled={isFuture}
              style={({ pressed }) => [
                calStyles.cell,
                col && { backgroundColor: col.bg },
                isSelected && { borderWidth: 2, borderColor: colors.primary, borderRadius: 10 },
                isToday && !isSelected && { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10 },
                isFuture && { opacity: 0.3 },
                pressed && !isFuture && { opacity: 0.7 },
              ]}
            >
              <Text style={[
                calStyles.cellDay,
                { color: col ? col.dot : (isToday ? colors.primary : colors.text) },
                isToday && { fontWeight: '800' },
                isSelected && { fontWeight: '800', color: colors.primary },
              ]}>
                {Number(cell.slice(8))}
              </Text>
              {stat && stat.total > 0 ? (
                <View style={calStyles.cellDots}>
                  {stat.present > 0 && <View style={[calStyles.dot, { backgroundColor: '#059669' }]} />}
                  {stat.late > 0    && <View style={[calStyles.dot, { backgroundColor: '#d97706' }]} />}
                  {stat.absent > 0  && <View style={[calStyles.dot, { backgroundColor: '#dc2626' }]} />}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Legend */}
      <View style={calStyles.legend}>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: '#059669' }]} />
          <Text style={[calStyles.legendText, { color: colors.textMuted }]}>Present</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: '#d97706' }]} />
          <Text style={[calStyles.legendText, { color: colors.textMuted }]}>Late</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: '#dc2626' }]} />
          <Text style={[calStyles.legendText, { color: colors.textMuted }]}>Absent</Text>
        </View>
        <Text style={[calStyles.legendText, { color: colors.textMuted, marginLeft: 8 }]}>
          · Tap a day to view
        </Text>
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 15, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '14.285714%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 0,
  },
  cellDay: { fontSize: 13, fontWeight: '500' },
  cellDots: { flexDirection: 'row', gap: 2, marginTop: 1 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 12 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11 },
});

function SummaryPill({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <View style={[summaryStyles.pill, { backgroundColor: bg }]}>
      <Text style={[summaryStyles.count, { color }]}>{count}</Text>
      <Text style={[summaryStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  pill: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 62 },
  count: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  label: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
});

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },

    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingTop: 4,
    },
    headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    classPickerWrap: { paddingHorizontal: 16, marginTop: 8 },

    datePicker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    dateArrow: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
    dateCenter: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    dateText: { fontSize: 14, fontWeight: '600' },
    todayHint: { fontSize: 11, marginTop: 2 },

    smsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginTop: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    smsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    smsLabel: { fontSize: 14, fontWeight: '500' },

    summary: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      justifyContent: 'space-between',
    },

    markAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1.5,
    },
    markAllText: { fontSize: 14, fontWeight: '700', color: '#059669' },

    noticeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
    },
    noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
    scanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 10,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1.5,
    },
    scanBtnText: { fontSize: 14, fontWeight: '700' },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 64 },
    emptyTitle: { fontSize: 16, fontWeight: '700' },
    empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, paddingHorizontal: 32 },

    studentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      minHeight: 56,
    },
    studentInfo: { flex: 1, marginRight: 12 },
    studentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    studentName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
    editHint: { opacity: 0.5 },
    editedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#d1fae5', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    editedText: { fontSize: 10, fontWeight: '700', color: '#059669' },
    studentCode: { fontSize: 11, marginTop: 2, fontFamily: 'monospace' },

    statusBtns: { flexDirection: 'row', gap: 6 },
    statusBtn: {
      width: 38,
      height: 38,
      borderRadius: 10,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusBtnText: { fontSize: 13, fontWeight: '800' },
  });
}
