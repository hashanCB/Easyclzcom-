// QR scan session — assistant scans student cards, marks attendance, optionally collects payment.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAssistantStore } from '../../lib/assistant/store';
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../../lib/theme/store';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTIONS_URL } from '../../lib/constants';
import { newId } from '../../lib/uuid';
import { useOutboxStore } from '../../lib/assistant/outbox';
import { readCachedClasses } from '../../lib/assistant/classCache';
import { rowToApi } from '../../lib/sync/client';
import {
  hydrateWorkingSet,
  lookupStudent,
  applyLocalAttendance,
  applyLocalPayment,
  addLocalStudent,
  paymentState,
  markedStudentIds,
  readWorkingSet,
  type PaymentState,
  type WsStudent,
} from '../../lib/assistant/workingSet';
import { buildStyles } from './session.styles';

// While a session is open, retry queued uploads on a light timer so anything
// captured offline lands as soon as the signal comes back. (Re-hydrating the
// working set is heavier, so we only do that on focus / reconnect, not here.)
const FLUSH_INTERVAL_MS = 15000;

// NetInfo lets us reconcile the instant connectivity returns, but it's a native
// module that only exists once it's compiled into the dev build. Load it softly
// so the app still runs on a binary that predates it — we simply fall back to
// the timer + app-refocus reconnect path. It lights up after the next rebuild.
type NetInfoModule = typeof import('@react-native-community/netinfo').default;
let NetInfo: NetInfoModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NetInfo = require('@react-native-community/netinfo').default as NetInfoModule;
} catch {
  /* native module not in this build — degrade gracefully */
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StudentInfo {
  id: string;
  name: string;
  student_code: string;
  grade: string | null;
  batch: string | null;
  // 'pending_payment' = self-joined student awaiting their first payment.
  join_status?: string | null;
  // True when this scan just registered/linked them from an account QR.
  justRegistered?: boolean;
}

type AttendanceStatus = 'present' | 'late' | 'absent';

interface ScannedState {
  student: StudentInfo;
  payment: PaymentState; // this-month paid/partial/unpaid + remaining balance
  todayAttendance: AttendanceStatus | null;
  saving: boolean;
  countdown: number; // seconds left for auto-confirm
  isFree?: boolean; // free card for this class — owes nothing
}

/** Format cents as a plain LKR amount, e.g. 150000 → "LKR 1,500". */
function lkr(cents: number): string {
  return `LKR ${Math.round(cents / 100).toLocaleString()}`;
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

export type ParsedQr =
  // A printed/portal card for a student already in a class.
  | { kind: 'student'; studentId: string; cardVersion: number; expUnix: number }
  // An account QR (v1a.<accountId>) — student may not be in this class yet.
  | { kind: 'account'; accountId: string; expUnix: number };

export function parseQr(data: string): ParsedQr | null {
  const parts = data.split('.');
  const expValid = (v: string) => {
    const e = parseInt(v, 10);
    return !isNaN(e) && e >= Math.floor(Date.now() / 1000) ? e : null;
  };
  // Account QR: v1a.<accountId>.<expUnix>
  if (parts[0] === 'v1a') {
    if (parts.length < 3) return null;
    const expUnix = expValid(parts[2]);
    if (expUnix === null) return null;
    return { kind: 'account', accountId: parts[1], expUnix };
  }
  // Student card: v1.<studentId>.<cardVersion>.<expUnix>
  if (parts[0] === 'v1') {
    if (parts.length < 4) return null;
    const expUnix = expValid(parts[3]);
    if (expUnix === null) return null;
    const cardVersion = parseInt(parts[2], 10);
    if (isNaN(cardVersion)) return null;
    return { kind: 'student', studentId: parts[1], cardVersion, expUnix };
  }
  return null;
}

const AUTO_CONFIRM_SECS = 10;

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SessionScreen() {
  const { classId, teacherId } = useLocalSearchParams<{ classId: string; teacherId: string }>();
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { profile, permissions, session } = useAssistantStore(useShallow((s) => ({
    profile: s.profile,
    permissions: s.permissions,
    session: s.session,
  })));
  const ensureFreshToken = useAssistantStore((s) => s.ensureFreshToken);

  const token = session?.access_token ?? '';
  const perm = permissions.find((p) => p.class_id === classId);
  const canPayment = perm?.permission === 'payment' || perm?.permission === 'both';
  // The payments RLS check is `collected_by_user_id = auth.uid()`. The auth user
  // id lives on the session and is always present while authenticated; the
  // fetched profile can be null (e.g. its load failed at login). Prefer the
  // session id so a payment is never queued with a null/blank collector — that
  // would 403 against RLS and wedge in the outbox.
  const collectorId = session?.user?.id ?? profile?.id ?? '';

  // Store-and-forward outbox — writes save locally first, upload when online.
  const enqueue = useOutboxStore((s) => s.enqueue);
  const flushOutbox = useOutboxStore((s) => s.flush);
  const queuedUploads = useOutboxStore((s) => s.items.length);

  const [scanning, setScanning] = useState(true);
  const [scanned, setScanned] = useState<ScannedState | null>(null);
  const [markedCount, setMarkedCount] = useState(0);
  const [totalStudents, setTotalStudents] = useState<number | null>(null);
  const [markingAbsent, setMarkingAbsent] = useState(false);

  // Payment modal
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [classFeeCents, setClassFeeCents] = useState<number | null>(null);
  // Confirm step — the amount entered is held here while the assistant reviews
  // it. Money is only recorded after an explicit Confirm, so a typo is caught
  // before it lands (and there is deliberately no after-the-fact undo).
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingCents, setPendingCents] = useState<number | null>(null);

  // "No card?" manual lookup — for students with no QR (e.g. a new self-joined
  // student awaiting their first payment, or anyone who forgot their card).
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Register-a-brand-new-student-at-the-door flow. The assistant can add a
  // student with no app and no card, then collect their first payment — no
  // teacher approval. We check for likely duplicates before creating.
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  // When set, the entered name matched existing students — confirm before
  // creating a duplicate.
  const [dupMatches, setDupMatches] = useState<WsStudent[] | null>(null);
  const canAddStudent = perm?.can_add_student === true;
  // Resolving an account QR against the server (one-scan register).
  const [accountBusy, setAccountBusy] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [permission, requestPermission] = useCameraPermissions();

  // Request camera permission once on mount if not yet determined.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Reconcile = re-auth if needed, flush queued writes, then re-hydrate the
  // working set so the local snapshot catches up with anything the teacher
  // changed. Runs at the connectivity edges (focus / reconnect), not on the
  // tight timer below.
  const reconcile = useCallback(async () => {
    const t = (await ensureFreshToken()) ?? token;
    if (!t) return;
    await flushOutbox(t);
    const ws = await hydrateWorkingSet(classId, t);
    // Keep the previous count if a re-hydrate came back empty (offline).
    setTotalStudents((prev) => (ws.students.length > 0 ? ws.students.length : prev));
    if (ws.feeCents != null) setClassFeeCents(ws.feeCents);
  }, [ensureFreshToken, token, flushOutbox, classId]);

  // Cheap, frequent: just drain the outbox (a no-op when it's empty).
  const flushNow = useCallback(async () => {
    const t = (await ensureFreshToken()) ?? token;
    if (t) await flushOutbox(t);
  }, [ensureFreshToken, token, flushOutbox]);

  // Local-first lifecycle:
  //  • load any uploads left queued from a previous (offline) session,
  //  • Prepare: hydrate the working set so scans resolve entirely offline,
  //  • drain the outbox on a light timer,
  //  • Reconcile on app refocus and the moment connectivity returns,
  //  • drop the snapshot when the session screen closes.
  useEffect(() => {
    useOutboxStore.getState().hydrate();
    void reconcile();

    const timer = setInterval(() => { void flushNow(); }, FLUSH_INTERVAL_MS);
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reconcile();
    });

    // Fire a reconcile only on the offline → online transition, not on every
    // NetInfo event (it emits repeatedly while connected). Optional — skipped
    // when the native module isn't in this build; the timer above still covers
    // reconnects within FLUSH_INTERVAL_MS.
    let netSub: (() => void) | undefined;
    try {
      let wasConnected = true;
      netSub = NetInfo?.addEventListener((state) => {
        const connected = state.isConnected !== false;
        if (connected && !wasConnected) void reconcile();
        wasConnected = connected;
      });
    } catch {
      netSub = undefined;
    }

    return () => {
      clearInterval(timer);
      appStateSub.remove();
      netSub?.();
      // NOTE: we intentionally do NOT clear the working set here. It must
      // survive leaving this screen so the assistant can prepare online, walk to
      // the door offline, and still scan. It's dropped only on logout.
    };
  }, [classId, reconcile, flushNow]);

  // Record a reviewed-and-confirmed collection: queue the payment row (durable,
  // offline-safe), reflect the new balance on the popup, then mark present —
  // both land via the outbox. Called only from the confirm step.
  function commitPayment(amountCents: number) {
    if (!scanned || !collectorId) return;
    // Decide whether this collection settles the month or leaves a balance:
    // total-after-this vs the class fee. A short or unknown fee counts as paid.
    const newTotal = scanned.payment.paidCents + amountCents;
    const settled = paymentState(newTotal, scanned.payment.feeCents);
    const payRowStatus = settled.status === 'partial' ? 'partial' : 'paid';

    const now = new Date().toISOString();
    const month = currentMonthKey();
    const payId = newId();
    // The payment row the teacher will create when they confirm the cash. Kept
    // in the collection's payload so confirmation reproduces it exactly.
    const payload = {
      id: payId,
      teacherId,
      studentId: scanned.student.id,
      classId,
      month,
      amountCents,
      status: payRowStatus,
      method: 'cash',
      collectedByUserId: collectorId,
      collectedByRole: 'assistant',
      collectedAt: now,
      createdAt: now,
      updatedAt: now,
      clientUpdatedAt: now,
    };
    // Queue a PENDING collection (not a live payment). The teacher reconciles the
    // physical cash and confirms it, which is when the real payment is recorded.
    enqueue('payment', {
      id: payId,
      teacher_id: teacherId,
      class_id: classId,
      created_by_assistant_id: collectorId,
      student_id: scanned.student.id,
      student_name: scanned.student.name,
      month,
      amount_cents: amountCents,
      payload,
      status: 'pending',
      collected_at: now,
      created_at: now,
    });
    const updated = applyLocalPayment(classId, scanned.student.id, amountCents);
    setScanned((prev) => (prev ? { ...prev, payment: updated } : prev));
    markAttendance(scanned.student.id, 'present');
  }

  // Mark all students who have NOT been scanned today as Absent
  async function handleMarkRemainingAbsent() {
    const today = todayIso();
    Alert.alert(
      'Mark Remaining as Absent',
      `Students who have not scanned in today will be marked Absent. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Absent',
          style: 'destructive',
          onPress: () => {
            setMarkingAbsent(true);
            try {
              // Everything we need is already in the local snapshot — no network.
              const ws = readWorkingSet(classId);
              if (!ws || ws.students.length === 0) {
                Alert.alert(
                  'Roster not loaded',
                  'Connect to the internet once to load this class before marking absentees.',
                );
                return;
              }

              const markedIds = markedStudentIds(classId);
              const unscanned = ws.students.filter((s) => !markedIds.has(s.id));
              if (unscanned.length === 0) {
                Alert.alert('All accounted for', 'Every student already has attendance marked today.');
                return;
              }

              const now = new Date().toISOString();
              const absentRows = unscanned.map((s) => ({
                id: newId(),
                teacher_id: teacherId,
                student_id: s.id,
                class_id: classId,
                date: today,
                status: 'absent',
                sms_intent: false,
                marked_by_user_id: profile?.id,
                marked_by_role: 'assistant',
                created_at: now,
                updated_at: now,
                client_updated_at: now,
              }));

              // Queue the batch (durable, offline-safe), update the local
              // snapshot so they show as marked, then kick a flush.
              enqueue('attendance', absentRows);
              unscanned.forEach((s) => applyLocalAttendance(classId, s.id, 'absent'));
              void flushNow();

              setMarkedCount((c) => c + unscanned.length);
              Alert.alert('Done', `${unscanned.length} student${unscanned.length > 1 ? 's' : ''} marked as Absent.`);
            } finally {
              setMarkingAbsent(false);
            }
          },
        },
      ],
    );
  }

  // Countdown ticker
  function startCountdown(onDone: () => void) {
    clearInterval(countdownRef.current!);
    setScanned((prev) => prev ? { ...prev, countdown: AUTO_CONFIRM_SECS } : prev);
    let secs = AUTO_CONFIRM_SECS;
    countdownRef.current = setInterval(() => {
      secs -= 1;
      setScanned((prev) => prev ? { ...prev, countdown: secs } : prev);
      if (secs <= 0) {
        clearInterval(countdownRef.current!);
        onDone();
      }
    }, 1000);
  }

  function stopCountdown() {
    clearInterval(countdownRef.current!);
  }

  useEffect(() => () => clearInterval(countdownRef.current!), []);

  const restHeaders = {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const markAttendance = useCallback((studentId: string, status: AttendanceStatus) => {
    stopCountdown();
    // Save to the local outbox first — instant, works with no signal. The
    // popup closes right away and the row uploads in the background (now if
    // online, on the next flush if not).
    const now = new Date().toISOString();
    enqueue('attendance', {
      id: newId(),
      teacher_id: teacherId,
      student_id: studentId,
      class_id: classId,
      date: todayIso(),
      status,
      sms_intent: false,
      marked_by_user_id: profile?.id,
      marked_by_role: 'assistant',
      created_at: now,
      updated_at: now,
      client_updated_at: now,
    });
    // Reflect it in the local snapshot so an immediate re-scan shows "already
    // marked", even with no signal.
    applyLocalAttendance(classId, studentId, status);
    setMarkedCount((c) => c + 1);
    setScanned(null);
    setScanning(true);
    void flushNow();
  }, [enqueue, flushNow, classId, teacherId, profile?.id]);

  // Account QR scan: ask the server to resolve this account in the current class
  // — returns the existing student, or registers a brand-new one (linking the
  // account by phone when it matches). One tap, no typing. Needs a connection.
  const handleAccountScan = useCallback(async (accountId: string) => {
    if (!canAddStudent) {
      Alert.alert('Not allowed', 'You don’t have permission to add students to this class.', [
        { text: 'Scan Again', onPress: () => setScanning(true) },
      ]);
      return;
    }
    setAccountBusy(true);
    try {
      const t = (await ensureFreshToken()) ?? token;
      const res = await fetch(`${FUNCTIONS_URL}/assistant_register_from_account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${t}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ account_id: accountId, class_id: classId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as { error?: { message?: string } }));
        Alert.alert('Could not add', d?.error?.message ?? 'Please try again.', [
          { text: 'Scan Again', onPress: () => setScanning(true) },
        ]);
        return;
      }
      const { student, created, linked } = (await res.json()) as {
        student: {
          id: string; name: string; student_code: string | null;
          grade: string | null; batch: string | null; card_version: number | null;
          join_status: string | null; fee_type: string | null; custom_fee_cents: number | null;
        };
        created: boolean; linked: boolean;
      };

      // Cache them locally so the collect popup resolves and re-scans work offline.
      addLocalStudent(classId, {
        id: student.id, name: student.name, student_code: student.student_code ?? 'New',
        grade: student.grade, batch: student.batch, card_version: student.card_version ?? 1,
        fee_type: student.fee_type ?? 'regular', custom_fee_cents: student.custom_fee_cents ?? null,
        student_phone: null, join_status: student.join_status ?? 'confirmed',
      });

      const info = lookupStudent(classId, student.id);
      const resolved: StudentInfo = {
        id: student.id, name: student.name, student_code: student.student_code ?? 'New',
        grade: student.grade, batch: student.batch, join_status: student.join_status,
        justRegistered: created || linked,
      };
      setScanned({
        student: resolved,
        todayAttendance: info?.attendance ?? null,
        payment: info?.payment ?? paymentState(0, classFeeCents),
        saving: false,
        countdown: AUTO_CONFIRM_SECS,
        isFree: info?.isFree ?? false,
      });
      if (!info?.attendance) startCountdown(() => markAttendance(resolved.id, 'present'));
    } catch {
      Alert.alert(
        'Offline',
        'A connection is needed to add a new student. A student already in this class can scan their class card offline.',
        [{ text: 'Scan Again', onPress: () => setScanning(true) }],
      );
    } finally {
      setAccountBusy(false);
    }
  }, [canAddStudent, ensureFreshToken, token, classId, classFeeCents, markAttendance]);

  const onQrScanned = useCallback(async ({ data }: { data: string }) => {
    if (!scanning || scanned) return;
    setScanning(false);

    const parsed = parseQr(data);
    if (!parsed) {
      Alert.alert('Invalid QR', 'This QR code is not a valid student card.', [
        { text: 'Scan Again', onPress: () => setScanning(true) },
      ]);
      return;
    }

    // Account QR — student may not be in this class yet. Resolve/register online.
    if (parsed.kind === 'account') {
      await handleAccountScan(parsed.accountId);
      return;
    }

    let student: StudentInfo | null = null;
    let cardVersion = 1;
    let todayAtt: AttendanceStatus | null = null;
    // Default to "nothing collected yet" against the known class fee; the
    // snapshot overwrites this when the student is in it.
    let payState: PaymentState = paymentState(0, classFeeCents);
    let isFree = false;

    // Local-first read: resolve the student and their status straight from the
    // working-set snapshot. Instant, and works at a dead-signal doorway.
    const info = lookupStudent(classId, parsed.studentId);
    if (info) {
      const s = info.student;
      student = { id: s.id, name: s.name, student_code: s.student_code, grade: s.grade, batch: s.batch, join_status: s.join_status };
      cardVersion = s.card_version ?? 1;
      todayAtt = info.attendance;
      payState = info.payment;
      isFree = info.isFree;
    } else {
      // Not in the snapshot — likely a student added after we last hydrated. If
      // we have a connection, look them up live; otherwise we can't verify.
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/students?id=eq.${parsed.studentId}&class_id=eq.${classId}&deleted_at=is.null&select=id,name,student_code,grade,batch,card_version,join_status&limit=1`,
          { headers: restHeaders },
        );
        const students = await res.json().catch(() => []);
        if (!Array.isArray(students) || students.length === 0) {
          Alert.alert('Not in Class', 'This student is not in the current class.', [
            { text: 'Scan Again', onPress: () => setScanning(true) },
          ]);
          return;
        }
        const s = students[0];
        student = { id: s.id, name: s.name, student_code: s.student_code, grade: s.grade, batch: s.batch, join_status: s.join_status };
        cardVersion = s.card_version ?? 1;
      } catch {
        Alert.alert(
          'Offline',
          "Can't verify this student without a connection, and they're not in the saved class. Try again when back online.",
          [{ text: 'Scan Again', onPress: () => setScanning(true) }],
        );
        return;
      }
    }

    // Card version check — reissued cards invalidate old prints.
    if (parsed.cardVersion !== cardVersion) {
      Alert.alert(
        'Card Expired',
        `This QR card has been reissued. Ask the student to show their new card (v${cardVersion}).`,
        [{ text: 'Scan Again', onPress: () => setScanning(true) }],
      );
      return;
    }

    const resolved = student;
    const state: ScannedState = {
      student: resolved,
      todayAttendance: todayAtt,
      payment: payState,
      saving: false,
      countdown: AUTO_CONFIRM_SECS,
      isFree,
    };
    setScanned(state);

    // Auto-confirm as present after countdown (only if not already marked)
    if (!todayAtt) {
      startCountdown(() => markAttendance(resolved.id, 'present'));
    }
  }, [scanning, scanned, classId, token, markAttendance, handleAccountScan]);

  // Open a student picked from the "find by name" list — same popup as a scan,
  // but resolved straight from the local snapshot (no QR / card-version check,
  // since there is no card to read). Used for students with no QR yet.
  const openStudentById = useCallback((studentId: string) => {
    const info = lookupStudent(classId, studentId);
    if (!info) return;
    const s = info.student;
    const resolved: StudentInfo = {
      id: s.id, name: s.name, student_code: s.student_code,
      grade: s.grade, batch: s.batch, join_status: s.join_status,
    };
    setShowSearch(false);
    setSearchQuery('');
    setScanning(false);
    setScanned({
      student: resolved,
      todayAttendance: info.attendance,
      payment: info.payment,
      saving: false,
      countdown: AUTO_CONFIRM_SECS,
      isFree: info.isFree,
    });
    if (!info.attendance) {
      startCountdown(() => markAttendance(resolved.id, 'present'));
    }
  }, [classId, markAttendance]);

  // Local roster filtered for the "find by name" sheet — matches name, code, or
  // phone. Waiting (pending-payment) students sort to the top so the assistant
  // can register them fast.
  const searchResults = useMemo(() => {
    const ws = readWorkingSet(classId);
    const all = ws?.students ?? [];
    const q = searchQuery.trim().toLowerCase();
    const matched = q
      ? all.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          s.student_code.toLowerCase().includes(q) ||
          (s.student_phone ?? '').toLowerCase().includes(q))
      : all;
    return [...matched].sort((a, b) => {
      const aw = a.join_status === 'pending_payment' ? 0 : 1;
      const bw = b.join_status === 'pending_payment' ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
  }, [classId, searchQuery, showSearch]);

  // ── Register a brand-new student at the door ────────────────────────────────
  function resetNewStudent() {
    setShowNewStudent(false);
    setNewName('');
    setNewPhone('');
    setDupMatches(null);
  }

  // Likely duplicates of what the assistant typed — same/similar name, or the
  // same phone — so we don't create a second record for an existing student.
  function findDuplicates(name: string, phone: string): WsStudent[] {
    const ws = readWorkingSet(classId);
    const all = ws?.students ?? [];
    const n = name.trim().toLowerCase();
    const p = phone.replace(/\D/g, '');
    if (!n && !p) return [];
    return all.filter((s) => {
      const sn = s.name.toLowerCase();
      const sp = (s.student_phone ?? '').replace(/\D/g, '');
      const nameHit = n.length >= 2 && (sn.includes(n) || n.includes(sn));
      const phoneHit = p.length >= 7 && sp.length >= 7 && sp === p;
      return nameHit || phoneHit;
    });
  }

  // Step 1: validate + duplicate-check. If there are likely matches, show them
  // for the assistant to confirm before we create a new record.
  function onSubmitNewStudent() {
    const name = newName.trim();
    if (name.length < 2) {
      Alert.alert('Name needed', 'Enter the student’s name to add them.');
      return;
    }
    if (!canAddStudent) {
      Alert.alert('Not allowed', 'You don’t have permission to add students to this class.');
      return;
    }
    const meta = readCachedClasses().find((c) => c.id === classId);
    if (!meta) {
      Alert.alert(
        'Class not loaded',
        'Open this class once while online so its details load, then you can add new students at the door.',
      );
      return;
    }
    const matches = findDuplicates(name, newPhone);
    if (matches.length > 0 && dupMatches === null) {
      setDupMatches(matches);
      return;
    }
    createNewStudent(name, newPhone.trim(), meta);
  }

  // Step 2: create the real student locally (queued to the live roster, no
  // approval) and open the collect popup so the assistant takes the first money.
  function createNewStudent(
    name: string,
    phone: string,
    meta: { grade: string; batch: string; subject: string; language: string },
  ) {
    const id = newId();
    const now = new Date().toISOString();
    const row = rowToApi(
      {
        id,
        teacherId,
        classId,
        studentCode: undefined, // DB trigger assigns STU-####
        createdByAssistantId: collectorId,
        name,
        studentPhone: phone || null,
        grade: meta.grade,
        batch: meta.batch,
        subject: meta.subject,
        language: meta.language,
        feeType: 'regular',
        joinStatus: 'confirmed',
        cardVersion: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        clientUpdatedAt: now,
      },
      'students',
    );
    enqueue('student', row);

    // Make them immediately scannable/searchable and open the collect popup.
    const wsStudent: WsStudent = {
      id, name, student_code: 'New', grade: meta.grade, batch: meta.batch,
      card_version: 1, fee_type: 'regular', custom_fee_cents: null,
      student_phone: phone || null, join_status: 'confirmed',
    };
    addLocalStudent(classId, wsStudent);
    void flushNow();
    resetNewStudent();
    openStudentById(id);
  }

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Scan QR Cards</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 }}>
          {/* Pending uploads — tap to see exactly what's still waiting to send */}
          {queuedUploads > 0 && (
            <Pressable
              onPress={() => router.push({ pathname: '/(assistant)/queue', params: { classId } })}
              hitSlop={8}
              accessibilityLabel={`${queuedUploads} waiting to upload — tap to view`}
              style={({ pressed }) => [styles.queueChip, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="cloud-upload-outline" size={13} color="#d97706" />
              <Text style={styles.queueChipText}>{queuedUploads}</Text>
            </Pressable>
          )}
          {/* Mark remaining absent — shown once at least 1 student scanned */}
          {markedCount > 0 && totalStudents !== null && markedCount < totalStudents && (
            <Pressable
              onPress={handleMarkRemainingAbsent}
              disabled={markingAbsent}
              hitSlop={8}
              style={({ pressed }) => [
                styles.absentBtn,
                (pressed || markingAbsent) && { opacity: 0.6 },
              ]}
            >
              {markingAbsent
                ? <ActivityIndicator size={12} color="#dc2626" />
                : <Ionicons name="close-circle-outline" size={14} color="#dc2626" />
              }
              <Text style={styles.absentBtnText}>
                {totalStudents - markedCount} Absent
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push({ pathname: '/(assistant)/summary', params: { classId, teacherId } })}
            hitSlop={8}
            style={styles.summaryBtn}
          >
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{markedCount}</Text>
            </View>
            <Text style={[styles.summaryBtnText, { color: colors.primary }]}>Summary</Text>
          </Pressable>
        </View>
      </View>

      {/* Camera area */}
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
                ? 'Camera permission is required to scan student QR cards.'
                : 'Starting camera…'}
            </Text>
            {permission && !permission.granted && (
              <Pressable
                onPress={() => requestPermission()}
                style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f59e0b' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Grant Permission</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Scan frame overlay */}
        <View style={styles.scanOverlay} pointerEvents="none">
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.scanHint}>Point camera at student QR card</Text>
        </View>

        {/* Resolving an account QR against the server. */}
        {accountBusy && (
          <View style={styles.accountBusyOverlay} pointerEvents="auto">
            <ActivityIndicator color="#fff" />
            <Text style={styles.accountBusyText}>Looking up student…</Text>
          </View>
        )}

        {/* No-card fallback: find a student by name (e.g. a new student with no
            card yet, or someone who forgot theirs). Hidden while a popup is up. */}
        {!scanned && !accountBusy && (
          <Pressable
            onPress={() => { stopCountdown(); setSearchQuery(''); setShowSearch(true); }}
            style={({ pressed }) => [styles.noCardBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="search-outline" size={16} color="#fff" />
            <Text style={styles.noCardBtnText}>No card? Find by name</Text>
          </Pressable>
        )}
      </View>

      {/* Student popup */}
      {scanned && (
        <View style={[styles.popup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Student info */}
          <View style={styles.popupHeader}>
            <View style={[styles.popupAvatar, { backgroundColor: '#f59e0b18' }]}>
              <Text style={[styles.popupInitials, { color: '#f59e0b' }]}>
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
            {/* Payment badge — free cards get their own green "Free" tag. */}
            <View style={[styles.payBadge, {
              backgroundColor: scanned.isFree ? '#d1fae5'
                : scanned.payment.status === 'paid' ? '#d1fae5'
                : scanned.payment.status === 'partial' ? '#fef3c7' : '#fee2e2',
            }]}>
              <Text style={[styles.payBadgeText, {
                color: scanned.isFree ? '#059669'
                  : scanned.payment.status === 'paid' ? '#059669'
                  : scanned.payment.status === 'partial' ? '#d97706' : '#dc2626',
              }]}>
                {scanned.isFree ? 'Free' : scanned.payment.status === 'paid' ? 'Paid' : scanned.payment.status === 'partial' ? 'Partial' : 'Unpaid'}
              </Text>
            </View>
          </View>

          {/* Just registered from an account QR — now collect their payment. */}
          {scanned.student.justRegistered && (
            <View style={[styles.waitingBox, { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' }]}>
              <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
              <Text style={[styles.waitingText, { color: '#047857' }]}>
                Added to the class. {canPayment ? 'Collect their first payment now.' : ''}
              </Text>
            </View>
          )}

          {/* New self-joined student — first payment registers them. */}
          {scanned.student.join_status === 'pending_payment' && !scanned.student.justRegistered && (
            <View style={[styles.waitingBox, { backgroundColor: '#f5f3ff', borderColor: '#c4b5fd' }]}>
              <Ionicons name="hourglass-outline" size={15} color="#7c3aed" />
              <Text style={styles.waitingText}>
                {canPayment
                  ? 'New student — collect the first payment to register them.'
                  : 'New student — not registered until their first payment.'}
              </Text>
            </View>
          )}

          {/* Free card — no payment to collect for this class. */}
          {scanned.isFree && (
            <View style={[styles.waitingBox, { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' }]}>
              <Ionicons name="gift-outline" size={15} color="#059669" />
              <Text style={[styles.waitingText, { color: '#047857' }]}>
                Free card — no payment needed for this class. Just mark attendance.
              </Text>
            </View>
          )}

          {/* Partial-payment balance line */}
          {scanned.payment.status === 'partial' && (
            <View style={[styles.balanceBox, { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }]}>
              <Ionicons name="cash-outline" size={15} color="#d97706" />
              <Text style={styles.balanceText}>
                Paid {lkr(scanned.payment.paidCents)} · {lkr(scanned.payment.remainingCents)} still due
              </Text>
            </View>
          )}

          {/* Already marked notice */}
          {scanned.todayAttendance && (
            <View style={[styles.alreadyBox, { backgroundColor: '#d1fae518', borderColor: '#059669' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={{ fontSize: 13, color: '#059669', fontWeight: '600' }}>
                Already marked {scanned.todayAttendance} today
              </Text>
            </View>
          )}

          {/* Countdown bar */}
          {!scanned.todayAttendance && !scanned.saving && (
            <View style={styles.countdownRow}>
              <View style={[styles.countdownBar, { backgroundColor: colors.border }]}>
                <View style={[styles.countdownFill, { width: `${(scanned.countdown / AUTO_CONFIRM_SECS) * 100}%`, backgroundColor: '#059669' }]} />
              </View>
              <Text style={[styles.countdownText, { color: colors.textMuted }]}>
                Auto-Present in {scanned.countdown}s
              </Text>
            </View>
          )}

          {/* Action buttons */}
          {scanned.saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.savingText, { color: colors.textMuted }]}>Saving…</Text>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <ActionBtn label="Present" icon="checkmark-circle" color="#059669" bg="#d1fae5"
                onPress={() => { stopCountdown(); markAttendance(scanned.student.id, 'present'); }} />
              <ActionBtn label="Late" icon="time" color="#d97706" bg="#fef3c7"
                onPress={() => { stopCountdown(); markAttendance(scanned.student.id, 'late'); }} />
              <ActionBtn label="Absent" icon="close-circle" color="#dc2626" bg="#fee2e2"
                onPress={() => { stopCountdown(); markAttendance(scanned.student.id, 'absent'); }} />
              {canPayment && scanned.payment.status !== 'paid' && (
                <ActionBtn
                  label={scanned.payment.status === 'partial' ? 'Balance' : 'Collect'}
                  icon="card" color="#7c3aed" bg="#f5f3ff"
                  onPress={() => {
                    stopCountdown();
                    // Prefill the amount still owed (for a partial) or the full
                    // fee (for a fresh collection); blank if the fee is unknown.
                    const prefill = scanned.payment.remainingCents || classFeeCents || 0;
                    setPayAmount(prefill ? String(Math.round(prefill / 100)) : '');
                    setShowPayment(true);
                  }} />
              )}
            </View>
          )}

          {/* Dismiss */}
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
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {scanned?.payment.status === 'partial' ? 'Collect Balance' : 'Collect Payment'}
            </Text>
            {scanned && (
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                {scanned.student.name} · {currentMonthKey()}
                {scanned.payment.status === 'partial'
                  ? ` · ${lkr(scanned.payment.paidCents)} paid, ${lkr(scanned.payment.remainingCents)} due`
                  : ''}
              </Text>
            )}
            <Text style={[{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 16 }]}>
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
                onPress={() => {
                  if (!scanned) return;
                  const amountCents = Math.round(parseFloat(payAmount) * 100);
                  if (!amountCents || amountCents <= 0) return Alert.alert('Enter a valid amount');
                  // Never collect more than what's owed. When the fee is known,
                  // cap at the remaining balance (= full fee for an unpaid
                  // student, the shortfall for a partial one).
                  if (scanned.payment.feeCents != null && scanned.payment.feeCents > 0
                    && amountCents > scanned.payment.remainingCents) {
                    return Alert.alert(
                      'Amount exceeds what is owed',
                      `The most you can collect is ${lkr(scanned.payment.remainingCents)}.`,
                    );
                  }
                  // Without a collector id the server's RLS will reject the row.
                  // Bail loudly instead of queueing a payment that can never land.
                  if (!collectorId) {
                    return Alert.alert(
                      'Please sign in again',
                      'Your assistant session is incomplete, so this payment can’t be recorded. Sign out and back in, then try again.',
                    );
                  }
                  // Don't record yet — hand the amount to the confirm step so the
                  // assistant reads it back to the student before it's committed.
                  setPendingCents(amountCents);
                  setShowPayment(false);
                  setShowConfirm(true);
                }}
                style={[styles.modalBtn, { backgroundColor: '#7c3aed' }]}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Review</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm step — read the amount back before any money is recorded. */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmBox, { backgroundColor: colors.surface }]}>
            {scanned && pendingCents != null && (() => {
              const newTotal = scanned.payment.paidCents + pendingCents;
              const settled = paymentState(newTotal, scanned.payment.feeCents);
              const willSettle = settled.status !== 'partial';
              return (
                <>
                  <View style={styles.confirmIcon}>
                    <Ionicons name="cash-outline" size={26} color="#7c3aed" />
                  </View>
                  <Text style={[styles.confirmTitle, { color: colors.text }]}>Confirm payment</Text>
                  <Text style={[styles.confirmSub, { color: colors.textMuted }]}>
                    {scanned.student.name} · {scanned.student.student_code}
                  </Text>
                  <Text style={[styles.confirmSub, { color: colors.textMuted }]}>
                    {currentMonthKey()}
                  </Text>

                  <Text style={[styles.confirmAmount, { color: colors.text }]}>{lkr(pendingCents)}</Text>

                  <View style={[styles.confirmBalance, { borderColor: colors.border }]}>
                    <Text style={[styles.confirmBalanceText, { color: colors.textMuted }]}>
                      {willSettle
                        ? 'Settles this month — balance after: LKR 0'
                        : `Balance after: ${lkr(settled.remainingCents)} still due`}
                    </Text>
                  </View>

                  <View style={styles.modalBtns}>
                    <Pressable
                      onPress={() => { setShowConfirm(false); setShowPayment(true); }}
                      style={[styles.modalBtn, { backgroundColor: colors.surfaceAlt }]}
                    >
                      <Text style={[styles.modalBtnText, { color: colors.text }]}>Back</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const cents = pendingCents;
                        setShowConfirm(false);
                        setPendingCents(null);
                        commitPayment(cents);
                      }}
                      style={[styles.modalBtn, { backgroundColor: '#7c3aed' }]}
                    >
                      <Text style={[styles.modalBtnText, { color: '#fff' }]}>Confirm &amp; Record</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* "Find by name" sheet — no-card fallback. Lists this class's roster from
          the local snapshot; tapping opens the same popup as a scan. */}
      <Modal visible={showSearch} transparent animationType="slide" onRequestClose={() => setShowSearch(false)}>
        <View style={styles.searchBackdrop}>
          <View style={[styles.searchSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.searchHandle} />
            <Text style={[styles.searchTitle, { color: colors.text }]}>Find student</Text>
            <Text style={[styles.searchSubtitle, { color: colors.textMuted }]}>
              For students with no card yet, or who forgot theirs.
            </Text>

            <View style={[styles.searchInputRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Name, student ID, or phone"
                placeholderTextColor={colors.textMuted}
                autoFocus
                style={[styles.searchInput, { color: colors.text }]}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            <FlatList
              data={searchResults}
              keyExtractor={(s) => s.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              ListEmptyComponent={
                <Text style={[styles.searchEmpty, { color: colors.textMuted }]}>
                  {readWorkingSet(classId)?.students.length
                    ? 'No students match.'
                    : 'Roster not loaded. Connect to the internet once to load this class.'}
                </Text>
              }
              renderItem={({ item }) => {
                const waiting = item.join_status === 'pending_payment';
                return (
                  <Pressable
                    onPress={() => openStudentById(item.id)}
                    style={({ pressed }) => [
                      styles.searchRow,
                      { borderBottomColor: colors.border },
                      pressed && { opacity: 0.65 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.searchName, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.searchMeta, { color: colors.textMuted }]}>
                        {item.student_code}
                        {item.student_phone ? ` · ${item.student_phone}` : ''}
                      </Text>
                    </View>
                    {waiting && (
                      <View style={styles.searchWaitingTag}>
                        <Text style={styles.searchWaitingTagText}>⏳ New</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={colors.border} />
                  </Pressable>
                );
              }}
            />

            {canAddStudent && (
              <Pressable
                onPress={() => {
                  const prefill = searchQuery.trim();
                  setShowSearch(false);
                  setSearchQuery('');
                  setDupMatches(null);
                  setNewName(prefill);
                  setNewPhone('');
                  setShowNewStudent(true);
                }}
                style={[styles.searchAddNew, { backgroundColor: '#7c3aed' }]}
              >
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text style={styles.searchAddNewText}>Add new student</Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => { setShowSearch(false); setScanning(true); }}
              style={[styles.searchCancel, { borderColor: colors.border }]}
            >
              <Text style={[styles.searchCancelText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* New-student sheet — register a brand-new student, then collect their
          first payment. No teacher approval. */}
      <Modal visible={showNewStudent} transparent animationType="slide" onRequestClose={resetNewStudent}>
        <View style={styles.searchBackdrop}>
          <View style={[styles.searchSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.searchHandle} />

            {dupMatches && dupMatches.length > 0 ? (
              <>
                <Text style={[styles.searchTitle, { color: colors.text }]}>Already in the class?</Text>
                <Text style={[styles.searchSubtitle, { color: colors.textMuted }]}>
                  These look similar to “{newName.trim()}”. Tap one to collect for them, or add as new.
                </Text>
                <FlatList
                  data={dupMatches}
                  keyExtractor={(s) => s.id}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 260 }}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => { resetNewStudent(); openStudentById(item.id); }}
                      style={({ pressed }) => [
                        styles.searchRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.65 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.searchName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.searchMeta, { color: colors.textMuted }]}>
                          {item.student_code}{item.student_phone ? ` · ${item.student_phone}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.border} />
                    </Pressable>
                  )}
                />
                <Pressable
                  onPress={() => {
                    const meta = readCachedClasses().find((c) => c.id === classId);
                    if (meta) createNewStudent(newName.trim(), newPhone.trim(), meta);
                  }}
                  style={[styles.searchAddNew, { backgroundColor: '#7c3aed' }]}
                >
                  <Ionicons name="person-add-outline" size={16} color="#fff" />
                  <Text style={styles.searchAddNewText}>None of these — add as new</Text>
                </Pressable>
                <Pressable onPress={() => setDupMatches(null)} style={[styles.searchCancel, { borderColor: colors.border }]}>
                  <Text style={[styles.searchCancelText, { color: colors.text }]}>Back</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.searchTitle, { color: colors.text }]}>New student</Text>
                <Text style={[styles.searchSubtitle, { color: colors.textMuted }]}>
                  Added to the class now. Collect their first payment next — no approval needed.
                </Text>
                <View style={[styles.searchInputRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
                  <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Full name"
                    placeholderTextColor={colors.textMuted}
                    autoFocus
                    style={[styles.searchInput, { color: colors.text }]}
                  />
                </View>
                <View style={[styles.searchInputRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
                  <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    value={newPhone}
                    onChangeText={setNewPhone}
                    placeholder="Phone (optional)"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    style={[styles.searchInput, { color: colors.text }]}
                  />
                </View>
                <Pressable onPress={onSubmitNewStudent} style={[styles.searchAddNew, { backgroundColor: '#7c3aed' }]}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.searchAddNewText}>Add &amp; collect</Text>
                </Pressable>
                <Pressable
                  onPress={() => { resetNewStudent(); setScanning(true); }}
                  style={[styles.searchCancel, { borderColor: colors.border }]}
                >
                  <Text style={[styles.searchCancelText, { color: colors.text }]}>Cancel</Text>
                </Pressable>
              </>
            )}
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ alignItems: 'center', opacity: pressed ? 0.7 : 1, flex: 1 }]}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Ionicons name={icon as never} size={22} color={color} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </Pressable>
  );
}
