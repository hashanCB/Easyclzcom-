import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore, type ThemeColors } from '../lib/theme/store';
import { useAuthStore } from '../lib/auth/store';
import { newId as cryptoRandomId } from '../lib/uuid';
import type { Student, NewStudent } from '../db/schema/students';
import type { EnrollmentInput } from '../db/repositories/studentClassesRepo';
import { PhotoPickerButton } from './PhotoPickerButton';
import { R2Paths } from '../lib/r2/paths';
import { ClassPicker } from './ClassPicker';

const GENDERS = ['male', 'female', 'other'] as const;
const LANGUAGES = ['Sinhala', 'English', 'Tamil', 'Other'] as const;

type Gender = (typeof GENDERS)[number];

interface ClassOption {
  id: string;
  label: string;
  feeCents?: number;
  subject?: string;
  grade?: string;
  batch?: string;
  language?: string;
}

/** An enrollment as the form holds it: which class, plus the typed monthly fee. */
export interface InitialEnrollment {
  classId: string;
  feeType: string;
  customFeeCents: number | null;
}

interface Props {
  initial?: Student;
  /** Existing class enrollments (edit mode). Falls back to initial.classId. */
  initialEnrollments?: InitialEnrollment[];
  teacherId: string;
  classOptions: ClassOption[];
  generatedCode?: string;
  generatedPassword?: string;
  submitting?: boolean;
  /** Hide the R2 photo picker (e.g. assistant offline flow). Default false. */
  hidePhoto?: boolean;
  /** Show the "Send welcome SMS" toggle on new students. Default true. */
  allowWelcomeSms?: boolean;
  onSubmit: (
    data: NewStudent,
    opts?: { sendWelcomeSms?: boolean; enrollments?: EnrollmentInput[] },
  ) => void;
  onCancel?: () => void;
}

/** One class the student is enrolled in, with the monthly amount the teacher typed. */
interface ClassPick {
  classId: string;
  /** Monthly amount in whole Rupees, as a string. Empty/"0" + free → owes nothing. */
  amount: string;
  free: boolean;
}

interface FormState {
  /** Classes the student is in. The FIRST one is the primary class. */
  picks: ClassPick[];
  name: string;
  gender: Gender | '';
  studentPhone: string;
  address: string;
  parentName: string;
  parentMobile: string;
  grade: string;
  batch: string;
  subject: string;
  language: string;
  customLanguage: string;
  profilePhotoUrl: string;
  isActive: boolean;
  sendWelcomeSms: boolean;
}

function knownLanguage(lang: string | undefined | null): string {
  if (!lang) return 'Sinhala';
  return LANGUAGES.includes(lang as never) ? lang : 'Other';
}

/** Rupees string for a class given its fee type and the class's own fee. */
function amountForFee(
  feeType: string,
  customFeeCents: number | null,
  classFeeCents: number,
): { amount: string; free: boolean } {
  if (feeType === 'free') return { amount: '0', free: true };
  if (feeType === 'custom' && customFeeCents != null) {
    return { amount: String(Math.round(customFeeCents / 100)), free: false };
  }
  return { amount: String(Math.round(classFeeCents / 100)), free: false };
}

function buildInitial(
  initial: Student | undefined,
  initialEnrollments: InitialEnrollment[] | undefined,
  classOptions: ClassOption[],
): FormState {
  const lang = knownLanguage(initial?.language);
  const feeOf = (id: string) => classOptions.find((c) => c.id === id)?.feeCents ?? 0;

  // Build the initial class picks from existing enrollments, or fall back to the
  // student's single primary class (older students before multi-class).
  let picks: ClassPick[] = [];
  if (initialEnrollments && initialEnrollments.length > 0) {
    picks = initialEnrollments.map((e) => {
      const { amount, free } = amountForFee(e.feeType, e.customFeeCents, feeOf(e.classId));
      return { classId: e.classId, amount, free };
    });
  } else if (initial?.classId) {
    const { amount, free } = amountForFee(
      initial.feeType ?? 'regular',
      initial.customFeeCents ?? null,
      feeOf(initial.classId),
    );
    picks = [{ classId: initial.classId, amount, free }];
  }

  return {
    picks,
    name: initial?.name ?? '',
    gender: (initial?.gender as Gender | undefined) ?? '',
    studentPhone: initial?.studentPhone ?? '',
    address: initial?.address ?? '',
    parentName: initial?.parentName ?? '',
    parentMobile: initial?.parentMobile ?? '',
    grade: initial?.grade ?? '',
    batch: initial?.batch ?? '',
    subject: initial?.subject ?? '',
    language: lang,
    customLanguage: lang === 'Other' && initial?.language ? initial.language : '',
    profilePhotoUrl: initial?.profilePhotoUrl ?? '',
    isActive: initial?.isActive ?? true,
    // Default ON for new students: text them their portal link + login on register.
    sendWelcomeSms: true,
  };
}

function validate(s: FormState): string | null {
  if (!s.name.trim()) return 'Student name is required';
  if (s.picks.length === 0) return 'Select at least one class';
  for (const p of s.picks) {
    if (!p.free) {
      const n = Number(p.amount);
      if (!p.amount.trim() || isNaN(n) || n < 0) return 'Enter a valid amount for every class';
    }
  }
  return null;
}

/** Turn one class pick into the stored enrollment shape (feeType + cents). */
function pickToEnrollment(pick: ClassPick, classFeeCents: number): EnrollmentInput {
  if (pick.free || Number(pick.amount) === 0) {
    return { classId: pick.classId, feeType: 'free', customFeeCents: null };
  }
  const cents = Math.round(Number(pick.amount) * 100);
  // If the typed amount matches the class fee exactly it's a 'regular' fee;
  // otherwise it's a per-student amount ('custom').
  if (cents === classFeeCents) {
    return { classId: pick.classId, feeType: 'regular', customFeeCents: null };
  }
  return { classId: pick.classId, feeType: 'custom', customFeeCents: cents };
}

export function StudentForm({
  initial,
  initialEnrollments,
  teacherId,
  classOptions,
  generatedCode,
  generatedPassword,
  submitting,
  hidePhoto = false,
  allowWelcomeSms = true,
  onSubmit,
  onCancel,
}: Props) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const session = useAuthStore((s) => s.session);
  // Stable student ID for R2 key — use existing or generate once at mount
  const [studentId] = useState(() => initial?.id ?? cryptoRandomId());

  const [s, setS] = useState<FormState>(() => buildInitial(initial, initialEnrollments, classOptions));
  const [err, setErr] = useState<string | null>(null);

  const classById = useMemo(
    () => new Map(classOptions.map((c) => [c.id, c])),
    [classOptions],
  );

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  // Auto-fill grade/batch/subject/language from the PRIMARY (first) class.
  function autoFillFromPrimary(prev: FormState, primaryClassId: string | undefined): FormState {
    if (!primaryClassId) return prev;
    const cls = classById.get(primaryClassId);
    if (!cls) return prev;
    return {
      ...prev,
      grade: cls.grade ?? prev.grade,
      batch: cls.batch ?? prev.batch,
      subject: cls.subject ?? prev.subject,
      language: cls.language ? knownLanguage(cls.language) : prev.language,
      customLanguage:
        cls.language && !LANGUAGES.includes(cls.language as never) ? cls.language : prev.customLanguage,
    };
  }

  function toggleClass(id: string) {
    setS((prev) => {
      const exists = prev.picks.some((p) => p.classId === id);
      let picks: ClassPick[];
      if (exists) {
        picks = prev.picks.filter((p) => p.classId !== id);
      } else {
        const fee = classById.get(id)?.feeCents ?? 0;
        picks = [...prev.picks, { classId: id, amount: String(Math.round(fee / 100)), free: false }];
      }
      const next = { ...prev, picks };
      return autoFillFromPrimary(next, picks[0]?.classId);
    });
  }

  function setPickAmount(id: string, amount: string) {
    setS((prev) => ({
      ...prev,
      picks: prev.picks.map((p) => (p.classId === id ? { ...p, amount, free: false } : p)),
    }));
  }

  function togglePickFree(id: string) {
    setS((prev) => ({
      ...prev,
      picks: prev.picks.map((p) => {
        if (p.classId !== id) return p;
        const free = !p.free;
        const fee = classById.get(id)?.feeCents ?? 0;
        return { ...p, free, amount: free ? '0' : String(Math.round(fee / 100)) };
      }),
    }));
  }

  function submit() {
    const e = validate(s);
    if (e) { setErr(e); return; }
    setErr(null);
    const now = new Date().toISOString();
    const language = s.language === 'Other' ? s.customLanguage.trim() : s.language;

    const enrollments: EnrollmentInput[] = s.picks.map((p) =>
      pickToEnrollment(p, classById.get(p.classId)?.feeCents ?? 0),
    );
    // The first class is the primary one stored on the student row (back-compat
    // with all the screens that still read a single class_id + fee).
    const primary = enrollments[0]!;

    const payload: NewStudent = {
      id: studentId,
      teacherId,
      classId: primary.classId,
      studentCode: initial?.studentCode ?? generatedCode ?? 'STU-0001',
      name: s.name.trim(),
      studentPhone: s.studentPhone.trim() || null,
      gender: s.gender || null,
      address: s.address.trim() || null,
      parentName: s.parentName.trim() || null,
      parentMobile: s.parentMobile.trim() || null,
      // No longer editable in the form; keep any value already saved.
      parentWhatsapp: initial?.parentWhatsapp ?? null,
      emergencyContact: initial?.emergencyContact ?? null,
      grade: s.grade.trim() || null,
      batch: s.batch.trim() || null,
      subject: s.subject.trim() || null,
      language: language || null,
      feeType: primary.feeType,
      customFeeCents: primary.customFeeCents,
      profilePhotoUrl: s.profilePhotoUrl.trim() || null,
      passwordPlain: initial?.passwordPlain ?? generatedPassword ?? null,
      cardVersion: initial?.cardVersion ?? 1,
      isActive: s.isActive,
      deletedAt: initial?.deletedAt ?? null,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      clientUpdatedAt: now,
      syncedAt: initial?.syncedAt ?? null,
    };
    // Only fire the welcome SMS for new students who have a phone on file.
    const sendWelcomeSms = !initial && s.sendWelcomeSms && !!payload.studentPhone;
    onSubmit(payload, { sendWelcomeSms, enrollments });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      {/* How the student logs in — their own phone + the password they set when
          they register on the student app. The teacher does not create a login. */}
      <View style={styles.loginNote}>
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={styles.loginNoteText}>
          The student logs in to the student app with their phone number and their own password.
        </Text>
      </View>

      {/* Classes — pick one or many (e.g. Theory + Revision). Each has its own
          monthly amount. The first selected class auto-fills grade/batch/etc. */}
      <Field label="Classes *">
        {classOptions.length === 0 ? (
          <Text style={styles.hint}>Create a class first before adding students.</Text>
        ) : (
          <>
            {/* Selected classes as removable pills */}
            {s.picks.length > 0 && (
              <View style={styles.selectedPills}>
                {s.picks.map((p, idx) => {
                  const cls = classById.get(p.classId);
                  return (
                    <View key={p.classId} style={[styles.pill, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
                      <Text style={[styles.pillText, { color: colors.primary }]} numberOfLines={1}>
                        {cls?.label ?? p.classId}
                        {idx === 0 ? ' · Primary' : ''}
                      </Text>
                      <Pressable onPress={() => toggleClass(p.classId)} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={colors.primary} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Dropdown trigger */}
            <ClassPicker
              classes={classOptions.filter((c) => !s.picks.some((p) => p.classId === c.id))}
              value={undefined}
              onChange={(id) => { if (id) toggleClass(id); }}
              colors={colors}
              allowAll={false}
              placeholder={s.picks.length === 0 ? 'Select a class' : 'Add another class'}
              title="Select a class"
              style={{ marginTop: s.picks.length > 0 ? 8 : 0 }}
            />
          </>
        )}
        {s.picks.length > 0 ? (
          <Text style={[styles.autoFillHint, { color: colors.primary }]}>
            ✓ Grade, batch and subject come from the primary class
          </Text>
        ) : null}
      </Field>

      {/* Per-class monthly amount — one card per selected class. */}
      {s.picks.map((p, idx) => {
        const cls = classById.get(p.classId);
        const classFeeRs = Math.round((cls?.feeCents ?? 0) / 100);
        return (
          <View key={p.classId} style={styles.feeCard}>
            <View style={styles.feeCardHead}>
              <Text style={[styles.feeCardTitle, { color: colors.text }]} numberOfLines={1}>
                {cls?.label ?? p.classId}
              </Text>
              {idx === 0 ? (
                <Text style={[styles.primaryTag, { color: colors.primary, borderColor: colors.primary }]}>
                  Primary
                </Text>
              ) : null}
            </View>

            <View style={styles.feeRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.feeFieldLabel, { color: colors.textMuted }]}>
                  Monthly amount (Rs)
                </Text>
                <Input
                  value={p.amount}
                  onChangeText={(v) => setPickAmount(p.classId, v.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  placeholder={classFeeRs ? String(classFeeRs) : 'Amount'}
                  editable={!p.free}
                  colors={colors}
                  style={p.free ? { opacity: 0.5 } : undefined}
                />
              </View>
              <Pressable
                onPress={() => togglePickFree(p.classId)}
                style={({ pressed }) => [
                  styles.freeBtn,
                  {
                    borderColor: p.free ? colors.primary : colors.border,
                    backgroundColor: p.free ? colors.primary : 'transparent',
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={{ color: p.free ? colors.primaryText : colors.text, fontSize: 13, fontWeight: '600' }}>
                  Free
                </Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              {p.free
                ? 'This student pays nothing for this class.'
                : classFeeRs
                ? `Class fee is Rs ${classFeeRs.toLocaleString()}. Change it for this student if needed.`
                : 'Type the monthly amount this student pays for this class.'}
            </Text>
          </View>
        );
      })}

      <Field label="Full name *">
        <Input value={s.name} onChangeText={(v) => update('name', v)} colors={colors} />
      </Field>

      <Field label="Gender">
        <View style={styles.chipRow}>
          {GENDERS.map((g) => (
            <Chip
              key={g}
              label={g}
              active={s.gender === g}
              onPress={() => update('gender', s.gender === g ? '' : g)}
              colors={colors}
            />
          ))}
        </View>
      </Field>

      <Field label="Student phone">
        <Input value={s.studentPhone} onChangeText={(v) => update('studentPhone', v)} keyboardType="phone-pad" colors={colors} />
      </Field>

      <Field label="Address (optional)">
        <Input value={s.address} onChangeText={(v) => update('address', v)} multiline colors={colors} />
      </Field>

      <Field label="Parent / guardian name (optional)">
        <Input value={s.parentName} onChangeText={(v) => update('parentName', v)} colors={colors} />
      </Field>

      <Field label="Parent mobile (optional)">
        <Input value={s.parentMobile} onChangeText={(v) => update('parentMobile', v)} keyboardType="phone-pad" colors={colors} />
      </Field>

      {/* Grade, batch, subject and language all come from the class the student
          is in, so they're not asked here. */}

      {!hidePhoto ? (
        <Field label="Profile Photo">
          <View style={{ paddingVertical: 8 }}>
            <PhotoPickerButton
              r2Key={s.profilePhotoUrl}
              onUploaded={(key) => update('profilePhotoUrl', key)}
              accessToken={session?.access_token ?? ''}
              r2KeyBuilder={() => R2Paths.studentPhoto(teacherId, studentId)}
              label="Tap to upload student photo"
              size={72}
            />
          </View>
        </Field>
      ) : null}

      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: colors.text }]}>Active</Text>
        <Switch value={s.isActive} onValueChange={(v) => update('isActive', v)} />
      </View>

      {/* Welcome SMS — only when registering a new student. Texts them the
          portal join link plus their Student ID and password. */}
      {!initial && allowWelcomeSms ? (
        <View style={styles.welcomeBox}>
          <View style={styles.switchRow}>
            <Text style={[styles.label, { color: colors.text }]}>
              Send welcome SMS
            </Text>
            <Switch
              value={s.sendWelcomeSms && !!s.studentPhone.trim()}
              disabled={!s.studentPhone.trim()}
              onValueChange={(v) => update('sendWelcomeSms', v)}
            />
          </View>
          <Text style={styles.hint}>
            {s.studentPhone.trim()
              ? 'Texts the student their portal join link and login (Student ID + password).'
              : 'Add a student phone above to text them the portal link and login.'}
          </Text>
        </View>
      ) : null}

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <View style={styles.actions}>
        {onCancel ? (
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.btn, styles.btnGhost, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={submitting}
          onPress={submit}
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary }, (pressed || submitting) && { opacity: 0.85 }]}
        >
          <Text style={[styles.btnText, { color: colors.primaryText }]}>
            {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create student'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useThemeStore((s) => s.colors);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6, fontWeight: '600' }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput> & { colors: ThemeColors }) {
  const { colors, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...rest}
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          color: colors.text,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          minHeight: 42,
        },
        style,
      ]}
    />
  );
}

function Chip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primary : 'transparent',
          marginRight: 8,
          marginBottom: 8,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={{ color: active ? colors.primaryText : colors.text, fontSize: 13, fontWeight: '500', textTransform: 'capitalize' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.bg },
    body: { padding: 16, paddingBottom: 120 },
    row2: { flexDirection: 'row', gap: 12 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
    selectedPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
    pillText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
    label: { fontSize: 15, fontWeight: '500' },
    hint: { color: colors.textMuted, fontSize: 13 },
    autoFillHint: { fontSize: 11, marginTop: 4, fontWeight: '500' },
    err: { color: '#dc2626', marginTop: 8, fontSize: 13 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    btnGhost: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth },
    btnText: { fontWeight: '600', fontSize: 15 },
    loginNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primary,
      backgroundColor: colors.primary + '0d',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    loginNoteText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
    welcomeBox: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
    },
    feeCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    feeCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    feeCardTitle: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
    primaryTag: {
      fontSize: 10,
      fontWeight: '700',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
      overflow: 'hidden',
    },
    feeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    feeFieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6 },
    freeBtn: {
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
