// Teacher QR scanner — teacher can scan a student's QR card directly.
// Marks attendance or collects payment without needing an assistant.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreenTitle } from '../../../lib/ui/header';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useShallow } from 'zustand/react/shallow';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../lib/constants';
import { newId } from '../../../lib/uuid';
import { parseQr } from '../../(assistant)/session';
import { attendanceMarkGate, type MarkGate } from '../../../lib/classes/attendanceWindow';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StudentInfo {
  id: string;
  name: string;
  student_code: string;
  grade: string | null;
  batch: string | null;
  card_version: number;
}

type AttendanceStatus = 'present' | 'late' | 'absent';

interface ScannedState {
  student: StudentInfo;
  paymentStatus: string | null;
  todayAttendance: AttendanceStatus | null;
  saving: boolean;
  countdown: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const AUTO_CONFIRM_SECS = 10;

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function TeacherScanScreen() {
  // classId is optional — if provided, restricts to that class and shows class context
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  useScreenTitle('Scan Student QR');
  const colors = useThemeStore((s) => s.colors);
  const { teacher, session } = useAuthStore(useShallow((s) => ({ teacher: s.teacher, session: s.session })));

  const token = session?.access_token ?? '';
  const teacherId = teacher?.id ?? '';

  const [scanning, setScanning] = useState(true);
  const [scanned, setScanned] = useState<ScannedState | null>(null);
  const [markedCount, setMarkedCount] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [classFeeCents, setClassFeeCents] = useState<number | null>(null);
  // Whether marking is allowed for this class right now (today + window open).
  // null while loading / when no class is scoped.
  const [classGate, setClassGate] = useState<MarkGate | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!classId) return;
    fetch(
      `${SUPABASE_URL}/rest/v1/classes?id=eq.${classId}&select=monthly_fee_cents,class_day,class_schedule,class_start_time,class_end_time,qr_grace_minutes_before&limit=1`,
      { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' } },
    ).then((r) => r.json()).then((rows) => {
      if (Array.isArray(rows) && rows.length > 0) {
        const c = rows[0];
        setClassFeeCents(c.monthly_fee_cents);
        // Same rule as manual marking: only today's class, only once the window
        // (start − grace … end of day) is open.
        setClassGate(attendanceMarkGate({
          classDay: c.class_day,
          classSchedule: c.class_schedule,
          classStartTime: c.class_start_time,
          classEndTime: c.class_end_time,
          qrGraceMinutesBefore: c.qr_grace_minutes_before,
        }));
      }
    }).catch(() => {});
  }, [classId, token]);

  useEffect(() => () => clearInterval(countdownRef.current!), []);

  const restHeaders = {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  function startCountdown(onDone: () => void) {
    clearInterval(countdownRef.current!);
    let secs = AUTO_CONFIRM_SECS;
    setScanned((prev) => prev ? { ...prev, countdown: secs } : prev);
    countdownRef.current = setInterval(() => {
      secs -= 1;
      setScanned((prev) => prev ? { ...prev, countdown: secs } : prev);
      if (secs <= 0) { clearInterval(countdownRef.current!); onDone(); }
    }, 1000);
  }

  function stopCountdown() { clearInterval(countdownRef.current!); }

  const markAttendance = useCallback(async (studentId: string, resolvedClassId: string, status: AttendanceStatus) => {
    setScanned((prev) => prev ? { ...prev, saving: true } : prev);
    stopCountdown();
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/attendance`, {
        method: 'POST',
        headers: { ...restHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: newId(),
          teacher_id: teacherId,
          student_id: studentId,
          class_id: resolvedClassId,
          date: todayIso(),
          status,
          sms_intent: false,
          marked_by_user_id: teacher?.id,
          marked_by_role: 'teacher',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          client_updated_at: new Date().toISOString(),
        }),
      });
      setMarkedCount((c) => c + 1);
      setScanned(null);
      setScanning(true);
    } catch {
      Alert.alert('Error', 'Failed to save attendance.');
      setScanned((prev) => prev ? { ...prev, saving: false } : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, teacherId]);

  const onQrScanned = useCallback(async ({ data }: { data: string }) => {
    if (!scanning || scanned) return;
    setScanning(false);

    const parsed = parseQr(data);
    if (!parsed) {
      Alert.alert('Invalid QR', 'Not a valid student card.', [
        { text: 'Scan Again', onPress: () => setScanning(true) },
      ]);
      return;
    }
    // Account QRs (for not-yet-registered students) are handled in the assistant
    // door flow, not here — this screen looks up existing student cards.
    if (parsed.kind !== 'student') {
      Alert.alert(
        'New student',
        'This is an account QR for a student who isn’t in a class yet. Add them from the Students screen, or register them at the door.',
        [{ text: 'Scan Again', onPress: () => setScanning(true) }],
      );
      return;
    }

    // Build query — filter by teacher, optionally by class
    const classFilter = classId ? `&class_id=eq.${classId}` : '';
    const [studentRes, attendanceRes, paymentRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${parsed.studentId}&teacher_id=eq.${teacherId}${classFilter}&deleted_at=is.null&select=id,name,student_code,grade,batch,card_version,class_id&limit=1`, { headers: restHeaders }),
      classId
        ? fetch(`${SUPABASE_URL}/rest/v1/attendance?student_id=eq.${parsed.studentId}&class_id=eq.${classId}&date=eq.${todayIso()}&deleted_at=is.null&select=status&limit=1`, { headers: restHeaders })
        : Promise.resolve(new Response('[]')),
      classId
        ? fetch(`${SUPABASE_URL}/rest/v1/payments?student_id=eq.${parsed.studentId}&class_id=eq.${classId}&month=eq.${currentMonthKey()}&deleted_at=is.null&select=status&limit=1`, { headers: restHeaders })
        : Promise.resolve(new Response('[]')),
    ]);

    const students = await studentRes.json().catch(() => []);
    if (!Array.isArray(students) || students.length === 0) {
      Alert.alert('Not Found', 'This student is not registered with your account.', [
        { text: 'Scan Again', onPress: () => setScanning(true) },
      ]);
      return;
    }

    // Validate card version
    const dbCardVersion: number = students[0]?.card_version ?? 1;
    if (parsed.cardVersion !== dbCardVersion) {
      Alert.alert('Card Reissued', `Ask the student to show their new card (v${dbCardVersion}).`, [
        { text: 'Scan Again', onPress: () => setScanning(true) },
      ]);
      return;
    }

    const attendanceRows = await attendanceRes.json().catch(() => []);
    const paymentRows = await paymentRes.json().catch(() => []);
    const resolvedClassId: string = classId ?? students[0].class_id;

    const state: ScannedState = {
      student: students[0],
      todayAttendance: attendanceRows[0]?.status ?? null,
      paymentStatus: paymentRows[0]?.status ?? null,
      saving: false,
      countdown: AUTO_CONFIRM_SECS,
    };
    setScanned(state);

    if (!state.todayAttendance) {
      startCountdown(() => markAttendance(students[0].id, resolvedClassId, 'present'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, scanned, classId, teacherId, token, markAttendance]);

  const styles = buildStyles(colors);

  // When scoped to a class, only allow scanning while that class's window is
  // open today. (No class scoped → direct teacher scan, unchanged.)
  const classChecking = !!classId && classGate === null;
  const markingBlocked = !!classId && classGate !== null && !classGate.ok;

  if (classChecking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.blockedWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.blockedText, { color: colors.textMuted }]}>Checking class schedule…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (markingBlocked) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.blockedWrap}>
          <Ionicons name="time-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.blockedTitle, { color: colors.text }]}>Can’t mark right now</Text>
          <Text style={[styles.blockedText, { color: colors.textMuted }]}>
            {classGate && !classGate.ok ? classGate.message : ''}
          </Text>
          <Text style={[styles.blockedText, { color: colors.textMuted }]}>
            Attendance can only be scanned on the class’s scheduled day, once its time window opens.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.actions}>
        <View style={styles.countBadgeWrap}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{markedCount}</Text>
          </View>
          <Text style={[styles.countLabel, { color: colors.textMuted }]}>marked</Text>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanning ? onQrScanned : undefined}
          />
        ) : (
          <View style={[styles.cameraFallback, { backgroundColor: '#111' }]}>
            <Ionicons name="camera-outline" size={60} color="#555" />
            <Text style={{ color: '#777', marginTop: 12, textAlign: 'center', paddingHorizontal: 32 }}>
              {permission && !permission.granted
                ? 'Camera permission required to scan QR cards.'
                : 'Starting camera…'}
            </Text>
            {permission && !permission.granted && (
              <Pressable
                onPress={() => requestPermission()}
                style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#4f46e5' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Grant Permission</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.scanOverlay} pointerEvents="none">
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.scanHint}>Point camera at student QR card</Text>
        </View>
      </View>

      {/* Student popup */}
      {scanned && (
        <View style={[styles.popup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.popupHeader}>
            <View style={[styles.popupAvatar, { backgroundColor: '#4f46e518' }]}>
              <Text style={[styles.popupInitials, { color: '#4f46e5' }]}>
                {scanned.student.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
            <View style={styles.popupInfo}>
              <Text style={[styles.popupName, { color: colors.text }]}>{scanned.student.name}</Text>
              <Text style={[styles.popupCode, { color: colors.textMuted }]}>{scanned.student.student_code}</Text>
              <Text style={[styles.popupClass, { color: colors.textMuted }]}>
                {[scanned.student.grade, scanned.student.batch].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={[styles.payBadge, {
              backgroundColor: scanned.paymentStatus === 'paid' ? '#d1fae5'
                : scanned.paymentStatus ? '#fef3c7' : '#fee2e2',
            }]}>
              <Text style={[styles.payBadgeText, {
                color: scanned.paymentStatus === 'paid' ? '#059669'
                  : scanned.paymentStatus ? '#d97706' : '#dc2626',
              }]}>
                {scanned.paymentStatus === 'paid' ? 'Paid' : scanned.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}
              </Text>
            </View>
          </View>

          {scanned.todayAttendance && (
            <View style={[styles.alreadyBox, { backgroundColor: '#d1fae518', borderColor: '#059669' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={{ fontSize: 13, color: '#059669', fontWeight: '600' }}>
                Already marked {scanned.todayAttendance} today
              </Text>
            </View>
          )}

          {!scanned.todayAttendance && !scanned.saving && (
            <View style={styles.countdownRow}>
              <View style={[styles.countdownBar, { backgroundColor: colors.border }]}>
                <View style={[styles.countdownFill, { width: `${(scanned.countdown / AUTO_CONFIRM_SECS) * 100}%` as never, backgroundColor: '#059669' }]} />
              </View>
              <Text style={[styles.countdownText, { color: colors.textMuted }]}>
                Auto-Present in {scanned.countdown}s
              </Text>
            </View>
          )}

          {scanned.saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.savingText, { color: colors.textMuted }]}>Saving…</Text>
            </View>
          ) : (
            <View style={styles.actionRow}>
              {(() => {
                const resolvedClassId: string = classId ?? scanned.student.id;
                return (
                  <>
                    <ActionBtn label="Present" icon="checkmark-circle" color="#059669" bg="#d1fae5"
                      onPress={() => { stopCountdown(); markAttendance(scanned.student.id, resolvedClassId, 'present'); }} />
                    <ActionBtn label="Late" icon="time" color="#d97706" bg="#fef3c7"
                      onPress={() => { stopCountdown(); markAttendance(scanned.student.id, resolvedClassId, 'late'); }} />
                    <ActionBtn label="Absent" icon="close-circle" color="#dc2626" bg="#fee2e2"
                      onPress={() => { stopCountdown(); markAttendance(scanned.student.id, resolvedClassId, 'absent'); }} />
                    {classId && scanned.paymentStatus !== 'paid' && (
                      <ActionBtn label="Collect" icon="card" color="#7c3aed" bg="#f5f3ff"
                        onPress={() => {
                          stopCountdown();
                          setPayAmount(classFeeCents ? String(classFeeCents / 100) : '');
                          setShowPayment(true);
                        }} />
                    )}
                  </>
                );
              })()}
            </View>
          )}

          {!scanned.saving && (
            <Pressable onPress={() => { stopCountdown(); setScanned(null); setScanning(true); }} style={styles.dismissBtn}>
              <Text style={[styles.dismissText, { color: colors.textMuted }]}>Dismiss — Scan Next</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Payment modal */}
      <Modal visible={showPayment} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Collect Payment</Text>
            {scanned && (
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                {scanned.student.name} · {currentMonthKey()}
              </Text>
            )}
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 16 }}>
              AMOUNT (LKR)
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => { setShowPayment(false); setScanned(null); setScanning(true); }}
                style={[styles.modalBtn, { backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!scanned || !classId) return;
                  const amountCents = Math.round(parseFloat(payAmount) * 100);
                  if (!amountCents || amountCents <= 0) return Alert.alert('Enter a valid amount');
                  setPayLoading(true);
                  try {
                    await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
                      method: 'POST',
                      headers: { ...restHeaders, Prefer: 'return=minimal' },
                      body: JSON.stringify({
                        id: newId(),
                        teacher_id: teacherId,
                        student_id: scanned.student.id,
                        class_id: classId,
                        month: currentMonthKey(),
                        amount_cents: amountCents,
                        status: 'paid',
                        method: 'cash',
                        collected_by_user_id: teacher?.id,
                        collected_by_role: 'teacher',
                        collected_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        client_updated_at: new Date().toISOString(),
                      }),
                    });
                    setShowPayment(false);
                    markAttendance(scanned.student.id, classId, 'present');
                  } catch {
                    Alert.alert('Error', 'Failed to record payment.');
                  } finally {
                    setPayLoading(false);
                  }
                }}
                disabled={payLoading}
                style={[styles.modalBtn, { backgroundColor: '#7c3aed' }]}
              >
                {payLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Record & Mark Present</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActionBtn({ label, icon, color, bg, onPress }: {
  label: string; icon: string; color: string; bg: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ alignItems: 'center', opacity: pressed ? 0.7 : 1, flex: 1 }]}>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Ionicons name={icon as never} size={22} color={color} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </Pressable>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#000' },
    blockedWrap: {
      flex: 1, backgroundColor: colors.bg,
      alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 32, gap: 12,
    },
    blockedTitle: { fontSize: 18, fontWeight: '800', marginTop: 4 },
    blockedText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
    actions: {
      flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      paddingHorizontal: 8, paddingTop: 4,
    },
    countBadgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
    countBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    countText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    countLabel: { fontSize: 12, fontWeight: '500' },

    cameraContainer: { flex: 1, position: 'relative' },
    cameraFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    scanFrame: { width: 220, height: 220, position: 'relative' },
    corner: { position: 'absolute', width: 28, height: 28, borderColor: '#4f46e5', borderWidth: 3 },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
    scanHint: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 20, textAlign: 'center' },

    popup: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderWidth: StyleSheet.hairlineWidth, padding: 20, paddingBottom: 32,
    },
    popupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    popupAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
    popupInitials: { fontSize: 18, fontWeight: '700' },
    popupInfo: { flex: 1 },
    popupName: { fontSize: 17, fontWeight: '700' },
    popupCode: { fontSize: 13, marginTop: 2 },
    popupClass: { fontSize: 12, marginTop: 1 },
    payBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    payBadgeText: { fontSize: 12, fontWeight: '700' },

    alreadyBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
    countdownRow: { marginBottom: 14 },
    countdownBar: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
    countdownFill: { height: 4, borderRadius: 2 },
    countdownText: { fontSize: 12, textAlign: 'center' },

    savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
    savingText: { fontSize: 14 },
    actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    dismissBtn: { alignItems: 'center', paddingVertical: 8 },
    dismissText: { fontSize: 14, fontWeight: '500' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    modalSub: { fontSize: 13, marginTop: 4 },
    modalInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '700', marginBottom: 20 },
    modalBtns: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    modalBtnText: { fontSize: 14, fontWeight: '700' },
  });
}
