import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions, useEarliestClassMonth } from '../../../lib/students/hooks';
import { ClassPicker } from '../../../components/ClassPicker';
import { useUnpaidStudents, checkDuplicatePayment, savePayment } from '../../../lib/payments/hooks';
import { newId } from '../../../lib/uuid';
import { useScreenTitle } from '../../../lib/ui/header';
import type { Student } from '../../../db/schema/students';
import type { OutstandingStudent } from '../../../db/repositories/paymentsRepo';
import { buildStyles } from './new.styles';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function buildMonthOptions(startMonth?: string | null, extraMonth?: string): string[] {
  const result: string[] = [];
  const now = new Date();
  // Step months with integer counters, not date.setMonth(): on the 31st of a
  // month, setMonth() rolls "April 31" forward to May 1, producing a duplicate
  // month key (and a duplicate-React-key crash).
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-11

  // How many months to show. When we know when the teacher started (the month
  // they created their first class), show EXACTLY from that month up to now —
  // never earlier. Only when the start is unknown do we fall back to 6 months.
  let count = 6;
  if (startMonth && /^\d{4}-\d{2}$/.test(startMonth)) {
    const [sy, sm] = startMonth.split('-').map(Number);
    const monthsSinceStart = (year - sy) * 12 + (month - (sm - 1)) + 1; // inclusive
    count = monthsSinceStart; // exact range, not a minimum
  }
  count = Math.max(1, Math.min(count, 60)); // clamp: at least 1 month, at most 5 years

  for (let i = 0; i < count; i++) {
    result.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    if (--month < 0) { month = 11; year -= 1; }
  }
  // When navigating from the outstanding screen, the prefill month may be older
  // than the range above. Include it so the chip renders and is selectable.
  if (extraMonth && !result.includes(extraMonth)) {
    result.push(extraMonth);
    result.sort((a, b) => b.localeCompare(a)); // newest-first
  }
  return result;
}

type Step = 'form' | 'confirm' | 'done';
const METHODS = ['cash', 'bank_transfer', 'card'] as const;
const STATUSES = ['paid', 'partial', 'free'] as const;

export default function NewPaymentScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? 'local';

  // Params passed by the Outstanding Fees screen ("Record Payment" / "Collect Balance").
  const {
    prefillStudentId,   // student code (e.g. "STU001")
    prefillClassId,     // class UUID
    prefillMonth,       // YYYY-MM
  } = useLocalSearchParams<{ prefillStudentId?: string; prefillClassId?: string; prefillMonth?: string }>();

  const classOptions = useClassOptions(teacherId);
  // Anchor the month list to when this teacher started — the month they created
  // their first class. We never show months from before that, and the list runs
  // from that month up to now.
  const earliestMonth = useEarliestClassMonth(teacherId);
  // Include the prefill month in the chip list even if it's older than the range.
  const monthOptions = useMemo(
    () => buildMonthOptions(earliestMonth, prefillMonth),
    [earliestMonth, prefillMonth],
  );

  const [step, setStep] = useState<Step>('form');
  useScreenTitle(step === 'form' ? 'Record Payment' : step === 'confirm' ? 'Confirm Payment' : 'Payment Recorded');
  const [classId, setClassId] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set([currentMonth()]));
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [status, setStatus] = useState<'paid' | 'partial' | 'free'>('paid');
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'card'>('cash');
  const [remark, setRemark] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [skippedMonths, setSkippedMonths] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  // Tracks whether the one-time prefill from route params has been applied.
  const [prefillApplied, setPrefillApplied] = useState(false);
  // Holds the outstanding-student info for the currently selected student so
  // the transparency card and balance-cap validation can read it.
  const [selectedStudentInfo, setSelectedStudentInfo] = useState<OutstandingStudent | null>(null);

  const styles = useMemo(() => buildStyles(colors), [colors]);

  // sorted oldest-first for saving order; newest for unpaid filter
  const sortedMonths = useMemo(() => [...selectedMonths].sort(), [selectedMonths]);
  const primaryMonth = sortedMonths[sortedMonths.length - 1] ?? currentMonth();
  const totalAmount = Number(amountStr) * selectedMonths.size;

  const { unpaid, loading: unpaidLoading } = useUnpaidStudents(classId, primaryMonth, teacherId);

  // ── Prefill from Outstanding Fees screen ───────────────────────────────────
  // Step 1: apply class + month as soon as we have the params (runs once).
  useEffect(() => {
    if (prefillApplied || !prefillClassId) return;
    setClassId(prefillClassId);
    setSelectedStudent(null);
    setStudentSearch('');
    setAmountStr('');
    if (prefillMonth) setSelectedMonths(new Set([prefillMonth]));
  }, [prefillClassId, prefillMonth, prefillApplied]);

  // Step 2: once the unpaid list loads for the prefilled class, auto-select
  // the student by their student code.
  useEffect(() => {
    if (prefillApplied || !prefillStudentId || unpaidLoading || unpaid.length === 0) return;
    const match = unpaid.find((s) => s.studentCode === prefillStudentId);
    if (match) {
      pickStudent(match);
      setPrefillApplied(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillStudentId, unpaid, unpaidLoading, prefillApplied]);
  // ──────────────────────────────────────────────────────────────────────────

  const filteredUnpaid = useMemo(() => {
    if (!studentSearch.trim()) return unpaid;
    const q = studentSearch.trim().toLowerCase();
    return unpaid.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q),
    );
  }, [unpaid, studentSearch]);

  function selectClass(id: string) {
    if (id === classId) return;
    setClassId(id);
    setSelectedStudent(null);
    setSelectedStudentInfo(null);
    setStudentSearch('');
    setAmountStr('');
  }

  function toggleMonth(m: string) {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(m);
      } else {
        next.add(m);
      }
      return next;
    });
    setSelectedStudent(null);
    setSelectedStudentInfo(null);
    setStudentSearch('');
  }

  function pickStudent(s: OutstandingStudent | Student) {
    setSelectedStudent(s);
    setStudentSearch('');
    const info = 'payStatus' in s ? (s as OutstandingStudent) : null;
    setSelectedStudentInfo(info);
    if (!amountStr) {
      // Pre-fill with exactly what is owed — the student's effective fee for a
      // fresh collection, or the remaining balance for a partial — so the
      // teacher never has to calculate (and custom/discounted fees are honoured).
      if (info && info.remainingCents > 0) {
        setAmountStr(String(Math.round(info.remainingCents / 100)));
      } else {
        const cls = classOptions.find((c) => c.id === classId);
        if (cls) setAmountStr(String(cls.feeCents / 100));
      }
    }
  }

  function clearStudent() {
    setSelectedStudent(null);
    setSelectedStudentInfo(null);
    setAmountStr('');
    setStudentSearch('');
  }

  function validate(): string {
    if (!classId) return 'Please select a class.';
    if (selectedMonths.size === 0) return 'Please select at least one month.';
    if (!selectedStudent) return 'Please select a student from the list.';
    if (!amountStr.trim() || isNaN(Number(amountStr)) || Number(amountStr) <= 0)
      return 'Enter a valid amount (e.g. 2500).';
    // Cap for every student: you can never record more than is owed — the
    // remaining balance for a partial, or the full effective fee otherwise.
    if (selectedStudentInfo && selectedStudentInfo.feeCents > 0) {
      const maxRs = Math.round(selectedStudentInfo.remainingCents / 100);
      if (Number(amountStr) > maxRs) {
        return `Amount exceeds the amount owed. Maximum you can record is Rs ${maxRs.toLocaleString()}.`;
      }
    }
    return '';
  }

  function handleNext() {
    const err = validate();
    if (err) { setError(err); return; }

    const dupes = sortedMonths.filter((m) => checkDuplicatePayment(selectedStudent!.id, m));
    if (dupes.length === sortedMonths.length) {
      setError(
        `${selectedStudent!.name} already has payments for all selected months.`,
      );
      return;
    }
    setSkippedMonths(dupes);
    setError('');
    setStep('confirm');
  }

  async function handleConfirm() {
    if (saving || !selectedStudent) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const monthsToSave = sortedMonths.filter(
        (m) => !checkDuplicatePayment(selectedStudent.id, m),
      );
      if (monthsToSave.length === 0) {
        Alert.alert('Already Paid', 'All selected months already have a payment recorded.');
        setSaving(false);
        setStep('form');
        return;
      }
      for (const m of monthsToSave) {
        savePayment({
          id: newId(),
          teacherId,
          studentId: selectedStudent.id,
          classId,
          month: m,
          amountCents: Math.round(Number(amountStr) * 100),
          status,
          method,
          location: location.trim() || null,
          remark: remark.trim() || null,
          collectedByUserId: teacherId,
          collectedByRole: 'teacher',
          collectedAt: now,
          createdAt: now,
          updatedAt: now,
          clientUpdatedAt: now,
          syncedAt: null,
          deletedAt: null,
        });
      }
      setSavedCount(monthsToSave.length);
      setStep('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save payment.';
      Alert.alert('Error', msg);
      setSaving(false);
    }
  }

  function buildReceiptText(): string {
    const monthsToSave = sortedMonths.filter((m) => !skippedMonths.includes(m));
    const lines = [
      '── Payment Receipt ──────────────────',
      `Student : ${selectedStudent?.name ?? '—'}`,
      `ID      : ${selectedStudent?.studentCode ?? '—'}`,
      `Class   : ${selectedClass?.label ?? classId}`,
    ];
    if (monthsToSave.length === 1) {
      lines.push(`Month   : ${monthLabel(monthsToSave[0])}`);
      lines.push(`Amount  : Rs ${Number(amountStr).toLocaleString()}`);
    } else {
      lines.push(`Months  : ${monthsToSave.map(monthLabel).join(', ')}`);
      lines.push(`Amount  : Rs ${Number(amountStr).toLocaleString()} × ${monthsToSave.length} = Rs ${(Number(amountStr) * monthsToSave.length).toLocaleString()}`);
    }
    lines.push(`Status  : ${status.charAt(0).toUpperCase() + status.slice(1)}`);
    lines.push(`Method  : ${method.replace('_', ' ')}`);
    if (location.trim()) lines.push(`Location: ${location.trim()}`);
    if (remark.trim()) lines.push(`Remark  : ${remark.trim()}`);
    lines.push(`Date    : ${new Date().toLocaleDateString()}`);
    lines.push('─────────────────────────────────────');
    return lines.join('\n');
  }

  async function handleShare() {
    try {
      await Share.share({ message: buildReceiptText() });
    } catch {
      // user cancelled — silent
    }
  }

  const selectedClass = classOptions.find((c) => c.id === classId);
  const monthsToSaveCount = sortedMonths.length - skippedMonths.length;

  // ── Receipt / done screen ─────────────────────────────────────────────────
  if (step === 'done') {
    const displayTotal = Number(amountStr) * savedCount;
    const displayMonths = sortedMonths.filter((m) => !skippedMonths.includes(m));

    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={[styles.scroll, { alignItems: 'center' }]}>
          {/* Success hero */}
          <View style={[styles.successCircle, { backgroundColor: '#059669' + '14' }]}>
            <Ionicons name="checkmark-circle" size={64} color="#059669" />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>
            Rs {displayTotal.toLocaleString()}
          </Text>
          <Text style={[styles.successSub, { color: colors.textMuted }]}>
            {savedCount > 1
              ? `${savedCount} months · ${selectedStudent!.name}`
              : `from ${selectedStudent!.name}`}
          </Text>

          {/* Receipt card */}
          <View style={[styles.receiptCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ReceiptRow icon="person-outline" label="Student" value={selectedStudent!.name} colors={colors} />
            <ReceiptRow icon="card-outline" label="Student ID" value={selectedStudent!.studentCode} colors={colors} mono />
            <ReceiptRow icon="school-outline" label="Class" value={selectedClass?.label ?? classId} colors={colors} />
            {savedCount === 1 ? (
              <ReceiptRow icon="calendar-outline" label="Month" value={monthLabel(displayMonths[0])} colors={colors} />
            ) : (
              <ReceiptRow
                icon="calendar-outline"
                label="Months"
                value={displayMonths.map(monthLabel).join('\n')}
                colors={colors}
              />
            )}
            <ReceiptRow
              icon="cash-outline"
              label="Amount"
              value={
                savedCount > 1
                  ? `Rs ${Number(amountStr).toLocaleString()} × ${savedCount}\n= Rs ${displayTotal.toLocaleString()}`
                  : `Rs ${Number(amountStr).toLocaleString()}`
              }
              colors={colors}
              bold
              valueColor="#059669"
            />
            <ReceiptRow
              icon="checkmark-circle-outline"
              label="Status"
              value={status.charAt(0).toUpperCase() + status.slice(1)}
              colors={colors}
            />
            <ReceiptRow icon="wallet-outline" label="Method" value={method.replace('_', ' ')} colors={colors} />
            {location.trim() ? (
              <ReceiptRow icon="location-outline" label="Location" value={location.trim()} colors={colors} />
            ) : null}
            {remark.trim() ? (
              <ReceiptRow icon="chatbox-outline" label="Remark" value={remark.trim()} colors={colors} />
            ) : null}
            <ReceiptRow
              icon="time-outline"
              label="Date"
              value={new Date().toLocaleDateString()}
              colors={colors}
              last
            />
          </View>

          {/* Skipped notice */}
          {skippedMonths.length > 0 ? (
            <View style={[styles.skipNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.skipNoticeText, { color: colors.textMuted }]}>
                {skippedMonths.map(monthLabel).join(', ')} already had a payment — skipped.
              </Text>
            </View>
          ) : null}

          {/* Action buttons */}
          <View style={styles.doneBtns}>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.shareBtn, { borderColor: colors.primary }, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
            >
              <Ionicons name="share-outline" size={18} color={colors.primary} />
              <Text style={[styles.shareBtnText, { color: colors.primary }]}>Share Receipt</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.doneBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-outline" size={18} color={colors.primaryText} />
              <Text style={[styles.doneBtnText, { color: colors.primaryText }]}>Done</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Confirm screen ────────────────────────────────────────────────────────
  if (step === 'confirm') {
    const perMonth = Number(amountStr);
    const total = perMonth * monthsToSaveCount;

    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={styles.wizardBackRow}>
          <Pressable
            onPress={() => setStep('form')}
            hitSlop={8}
            style={({ pressed }) => [styles.wizardBack, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Back to form"
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>Back</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {skippedMonths.length > 0 ? (
            <View style={[styles.skipNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.skipNoticeText, { color: colors.textMuted }]}>
                {skippedMonths.map(monthLabel).join(', ')} already paid — will be skipped.
              </Text>
            </View>
          ) : null}

          <View style={styles.confirmCard}>
            <View style={styles.confirmTitleRow}>
              <View style={[styles.confirmIconBox, { backgroundColor: '#059669' + '18' }]}>
                <Ionicons name="checkmark-circle-outline" size={22} color="#059669" />
              </View>
              <Text style={[styles.confirmTitle, { color: colors.text }]}>Payment Summary</Text>
            </View>

            <ConfirmRow label="Student" value={selectedStudent!.name} colors={colors} />
            <ConfirmRow label="Student ID" value={selectedStudent!.studentCode} colors={colors} />
            <ConfirmRow label="Class" value={selectedClass?.label ?? classId} colors={colors} />
            {monthsToSaveCount === 1 ? (
              <ConfirmRow
                label="Month"
                value={monthLabel(sortedMonths.find((m) => !skippedMonths.includes(m))!)}
                colors={colors}
              />
            ) : (
              <>
                <ConfirmRow
                  label={`Months (${monthsToSaveCount})`}
                  value={sortedMonths
                    .filter((m) => !skippedMonths.includes(m))
                    .map(monthLabel)
                    .join('\n')}
                  colors={colors}
                />
                <ConfirmRow
                  label="Per Month"
                  value={`Rs ${perMonth.toLocaleString()}`}
                  colors={colors}
                />
              </>
            )}
            <ConfirmRow
              label="Total"
              value={`Rs ${total.toLocaleString()}`}
              colors={colors}
              bold
            />
            <ConfirmRow label="Status" value={status.charAt(0).toUpperCase() + status.slice(1)} colors={colors} />
            <ConfirmRow label="Method" value={method.replace('_', ' ')} colors={colors} />
            {location.trim() ? <ConfirmRow label="Location" value={location.trim()} colors={colors} /> : null}
            {remark ? <ConfirmRow label="Remark" value={remark} colors={colors} /> : null}
          </View>

          <Pressable
            onPress={handleConfirm}
            disabled={saving}
            style={({ pressed }) => [styles.saveBtn, { opacity: saving || pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
          >
            <Ionicons name={saving ? 'hourglass-outline' : 'checkmark-circle-outline'} size={20} color={colors.primaryText} />
            <Text style={styles.saveBtnText}>
              {saving ? 'Saving…' : monthsToSaveCount > 1 ? `Confirm & Save ${monthsToSaveCount} Payments` : 'Confirm & Save'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Form screen ───────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          {/* Month — multi-select */}
          <View style={styles.labelRow}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Month</Text>
            {selectedMonths.size > 1 && (
              <Text style={[styles.selectedCount, { color: colors.primary }]}>
                {selectedMonths.size} selected
              </Text>
            )}
          </View>
          <View style={styles.chipRow}>
            {monthOptions.map((m) => {
              const active = selectedMonths.has(m);
              return (
                <Pressable
                  key={m}
                  onPress={() => toggleMonth(m)}
                  style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.85 }]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {monthLabel(m).split(' ').join('\n')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedMonths.size > 1 && (
            <View style={[styles.multiMonthBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="layers-outline" size={14} color={colors.primary} />
              <Text style={[styles.multiMonthText, { color: colors.textMuted }]}>
                Recording {selectedMonths.size} months · Rs {Number(amountStr) > 0 ? (Number(amountStr) * selectedMonths.size).toLocaleString() : '—'} total
              </Text>
            </View>
          )}

          {/* Class */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Class</Text>
          {classOptions.length === 0 ? (
            <Text style={styles.hint}>No active classes found. Create a class first.</Text>
          ) : (
            <ClassPicker
              classes={classOptions}
              value={classId || undefined}
              onChange={(id) => selectClass(id ?? '')}
              colors={colors}
              allowAll={false}
              placeholder="Select a class"
              title="Select a class"
            />
          )}

          {/* Student picker */}
          {classId ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Student</Text>

              {selectedStudent ? (
                <View style={styles.selectedCard}>
                  <View style={[styles.selectedAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.selectedAvatarText}>{selectedStudent.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedName}>{selectedStudent.name}</Text>
                    <Text style={styles.selectedCode}>{selectedStudent.studentCode}</Text>
                    {selectedStudent.grade ? (
                      <Text style={styles.selectedMeta}>Grade {selectedStudent.grade}{selectedStudent.batch ? ` · ${selectedStudent.batch}` : ''}</Text>
                    ) : null}
                  </View>
                  <Pressable onPress={clearStudent} style={[styles.changeBtn, { borderColor: colors.primary }]} hitSlop={8}>
                    <Text style={[styles.changeBtnText, { color: colors.primary }]}>Change</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={styles.searchWrapper}>
                    <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                    <TextInput
                      value={studentSearch}
                      onChangeText={setStudentSearch}
                      placeholder="Search by name or ID…"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.searchInput, { color: colors.text }]}
                    />
                  </View>

                  {unpaidLoading ? (
                    <Text style={styles.hint}>Loading students…</Text>
                  ) : unpaid.length === 0 ? (
                    <View style={[styles.allPaidBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="checkmark-circle-outline" size={28} color="#059669" />
                      <Text style={[styles.allPaidText, { color: colors.textMuted }]}>
                        All students have paid for {monthLabel(primaryMonth)}.
                      </Text>
                    </View>
                  ) : filteredUnpaid.length === 0 ? (
                    <Text style={styles.hint}>No students match "{studentSearch}".</Text>
                  ) : (
                    <View style={[styles.studentList, { borderColor: colors.border }]}>
                      {filteredUnpaid.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() => pickStudent(s)}
                          style={({ pressed }) => [
                            styles.studentRow,
                            { backgroundColor: colors.surface, borderBottomColor: colors.border },
                            pressed && { backgroundColor: colors.surfaceAlt },
                          ]}
                          accessibilityRole="button"
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.studentRowName, { color: colors.text }]} numberOfLines={1}>{s.name}</Text>
                            <Text style={[styles.studentRowCode, { color: colors.textMuted }]}>
                              {s.studentCode}{s.grade ? ` · Grade ${s.grade}` : ''}{s.batch ? ` · ${s.batch}` : ''}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}
            </>
          ) : (
            <View style={[styles.hintBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.hint, { marginTop: 0 }]}>Select a class to see unpaid students.</Text>
            </View>
          )}

          {/* Payment details */}
          {selectedStudent ? (
            <>
              {/* Partial-payment transparency card */}
              {selectedStudentInfo?.payStatus === 'partial' ? (
                <View style={[styles.partialCard, { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }]}>
                  <View style={styles.partialCardHeader}>
                    <Ionicons name="alert-circle" size={15} color="#d97706" />
                    <Text style={styles.partialCardTitle}>Partial payment on record</Text>
                  </View>
                  <View style={styles.partialRow}>
                    <Text style={styles.partialLabel}>Full fee</Text>
                    <Text style={styles.partialValue}>Rs {Math.round(selectedStudentInfo.feeCents / 100).toLocaleString()}</Text>
                  </View>
                  <View style={styles.partialRow}>
                    <Text style={styles.partialLabel}>Paid so far</Text>
                    <Text style={[styles.partialValue, { color: '#059669' }]}>Rs {Math.round(selectedStudentInfo.paidCents / 100).toLocaleString()}</Text>
                  </View>
                  <View style={[styles.partialRow, styles.partialRowLast]}>
                    <Text style={[styles.partialLabel, { fontWeight: '700', color: '#b45309' }]}>Remaining</Text>
                    <Text style={[styles.partialValue, { fontWeight: '800', color: '#b45309' }]}>Rs {Math.round(selectedStudentInfo.remainingCents / 100).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.partialCap}>Maximum amount you can record: Rs {Math.round(selectedStudentInfo.remainingCents / 100).toLocaleString()}</Text>
                </View>
              ) : selectedClass ? (
                <View style={[styles.feeHint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.feeHintText, { color: colors.textMuted }]}>
                    {selectedStudentInfo && selectedStudentInfo.feeCents !== selectedClass.feeCents
                      ? `Fee for this student: Rs ${Math.round(selectedStudentInfo.feeCents / 100).toLocaleString()} / month (custom)`
                      : `Class fee: Rs ${(selectedClass.feeCents / 100).toLocaleString()} / month`}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Amount per month (Rs)</Text>
              <TextInput
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />

              {selectedMonths.size > 1 && Number(amountStr) > 0 ? (
                <View style={[styles.totalRow, { backgroundColor: '#059669' + '10', borderColor: '#059669' + '30' }]}>
                  <Text style={{ fontSize: 13, color: '#059669' }}>
                    Rs {Number(amountStr).toLocaleString()} × {selectedMonths.size} months =
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#059669' }}>
                    Rs {totalAmount.toLocaleString()}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Status</Text>
              <View style={styles.chipRow}>
                {STATUSES.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    style={({ pressed }) => [styles.chip, status === s && styles.chipActive, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={[styles.chipText, status === s && styles.chipTextActive]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Method</Text>
              <View style={styles.chipRow}>
                {METHODS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    style={({ pressed }) => [styles.chip, method === m && styles.chipActive, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={[styles.chipText, method === m && styles.chipTextActive]}>
                      {m.replace('_', ' ')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Collection location (optional)</Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. At class, home visit, bank…"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Remark (optional)</Text>
              <TextInput
                value={remark}
                onChangeText={setRemark}
                placeholder="Add a note…"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={2}
                style={[styles.input, { height: 64, textAlignVertical: 'top', paddingTop: 10, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />

              <Pressable
                onPress={handleNext}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
              >
                <Text style={styles.saveBtnText}>
                  {selectedMonths.size > 1 ? `Review ${selectedMonths.size} Payments` : 'Review Payment'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primaryText} />
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function ConfirmRow({
  label, value, colors, bold,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 14, color: colors.textMuted, flexShrink: 0 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.text, fontWeight: bold ? '800' : '500', maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function ReceiptRow({
  icon, label, value, colors, bold, mono, valueColor, last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  bold?: boolean;
  mono?: boolean;
  valueColor?: string;
  last?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 10,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 10,
    }}>
      <Ionicons name={icon} size={15} color={colors.textMuted} style={{ width: 18, marginTop: 1 }} />
      <Text style={{ fontSize: 13, color: colors.textMuted, width: 80, paddingTop: 0 }}>{label}</Text>
      <Text style={{
        flex: 1,
        fontSize: 13,
        color: valueColor ?? colors.text,
        fontWeight: bold ? '800' : '500',
        fontFamily: mono ? 'monospace' : undefined,
        textAlign: 'right',
      }}>{value}</Text>
    </View>
  );
}
