import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
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
import { useThemeStore, type ThemeColors } from '../lib/theme/store';
import { useAuthStore } from '../lib/auth/store';
import { newId } from '../lib/uuid';
import type { Class, NewClass } from '../db/schema/classes';
import { PhotoPickerButton } from './PhotoPickerButton';
import { TimePickerModal } from './TimePickerModal';
import { R2Paths } from '../lib/r2/paths';

const CLASS_TYPES = ['al', 'ol', 'other'] as const;

// Grade options per class type. O/L covers grades 1–11, A/L covers 12–13.
// "Other" lets the teacher type any grade freely.
const OL_GRADES = Array.from({ length: 11 }, (_, i) => String(i + 1)); // '1'..'11'
const AL_GRADES = ['12', '13'];
function gradesForType(t: ClassType): string[] {
  return t === 'ol' ? OL_GRADES : t === 'al' ? AL_GRADES : [];
}
const LANGUAGES = ['Sinhala', 'English', 'Tamil', 'Other'] as const;
const DAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
] as const;

type ClassType = (typeof CLASS_TYPES)[number];

interface Props {
  initial?: Class;
  teacherId: string;
  submitting?: boolean;
  onSubmit: (data: NewClass) => void;
  onCancel?: () => void;
}

/** Lets a parent trigger the form's save (e.g. a Save button in the top bar). */
export interface ClassFormHandle {
  submit: () => void;
}

interface DayTimes {
  start: string;
  end: string;
}

interface FormState {
  classType: ClassType;
  customClassType: string;
  grade: string;
  batch: string;
  subject: string;
  language: string;
  customLanguage: string;
  monthlyFeeRupees: string;
  location: string;
  remark: string;
  imageUrl: string;
  classDays: string[];              // multi-select — stored comma-separated in DB
  daySchedules: Record<string, DayTimes>;  // per-day start/end times
  qrGraceMinutesBefore: string;
  paymentReminderDayOfMonth: string;
  paymentReminderTime: string;
  paymentReminderActive: boolean;
  isActive: boolean;
}

function buildDaySchedules(initial?: Class): Record<string, DayTimes> {
  const days = initial?.classDay
    ? initial.classDay.split(',').map((d) => d.trim()).filter(Boolean)
    : ['monday'];

  // If there's a stored per-day schedule, use it
  if (initial?.classSchedule) {
    try {
      const parsed = JSON.parse(initial.classSchedule) as Array<{ day: string; start: string; end: string }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const map: Record<string, DayTimes> = {};
        for (const entry of parsed) {
          map[entry.day] = { start: entry.start, end: entry.end };
        }
        // Fill any days not in the stored schedule with the shared fallback
        for (const d of days) {
          if (!map[d]) map[d] = { start: initial.classStartTime ?? '', end: initial.classEndTime ?? '' };
        }
        return map;
      }
    } catch {}
  }

  // Fall back: all days share the same times
  const shared: DayTimes = { start: initial?.classStartTime ?? '', end: initial?.classEndTime ?? '' };
  return Object.fromEntries(days.map((d) => [d, { ...shared }]));
}

function buildInitial(initial?: Class): FormState {
  const knownLang = initial && LANGUAGES.includes(initial.language as never);
  const classDays = initial?.classDay
    ? initial.classDay.split(',').map((d) => d.trim()).filter(Boolean)
    : ['monday'];
  return {
    classType: ((initial?.classType as ClassType) ?? 'al'),
    customClassType: initial?.customClassType ?? '',
    grade: initial?.grade ?? '',
    batch: initial?.batch ?? '',
    subject: initial?.subject ?? '',
    language: knownLang ? (initial!.language as string) : initial ? 'Other' : 'Sinhala',
    customLanguage: knownLang ? '' : initial?.language ?? '',
    monthlyFeeRupees: initial ? String(initial.monthlyFeeCents / 100) : '',
    location: initial?.location ?? '',
    remark: initial?.remark ?? '',
    imageUrl: initial?.imageUrl ?? '',
    classDays,
    daySchedules: buildDaySchedules(initial),
    qrGraceMinutesBefore: String(initial?.qrGraceMinutesBefore ?? 30),
    // Default new classes to remind on the 5th at 6:00 AM; keep saved values when editing.
    paymentReminderDayOfMonth: initial?.paymentReminderDayOfMonth
      ? String(initial.paymentReminderDayOfMonth)
      : initial ? '' : '5',
    paymentReminderTime: initial?.paymentReminderTime ?? (initial ? '' : '06:00'),
    paymentReminderActive: initial?.paymentReminderActive ?? true,
    isActive: initial?.isActive ?? true,
  };
}

function validate(s: FormState): string | null {
  if (!s.grade.trim()) return 'Grade is required';
  if (!s.batch.trim()) return 'Batch is required';
  if (!s.subject.trim()) return 'Subject is required';
  if (!s.location.trim()) return 'Location is required';
  if (s.classType === 'other' && !s.customClassType.trim())
    return 'Custom class type is required';
  if (s.language === 'Other' && !s.customLanguage.trim())
    return 'Language is required';
  if (s.classDays.length === 0) return 'Select at least one class day';
  const fee = Number(s.monthlyFeeRupees);
  if (!Number.isFinite(fee) || fee < 0) return 'Monthly fee must be a positive number';
  for (const day of s.classDays) {
    const sched = s.daySchedules[day];
    const label = day.charAt(0).toUpperCase() + day.slice(1);
    if (!sched || !/^\d{2}:\d{2}$/.test(sched.start)) return `${label}: please set a start time`;
    if (!sched || !/^\d{2}:\d{2}$/.test(sched.end)) return `${label}: please set an end time`;
    // HH:MM strings compare chronologically, so a plain string compare works.
    if (sched.start >= sched.end) return `${label}: start time must be before the end time`;
  }
  return null;
}

export const ClassForm = forwardRef<ClassFormHandle, Props>(function ClassForm(
  { initial, teacherId, submitting, onSubmit, onCancel },
  ref,
) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [s, setS] = useState<FormState>(() => buildInitial(initial));
  const [error, setError] = useState<string | null>(null);
  // Stable class ID for R2 key — use existing id or generate once at mount
  const [classId] = useState(() => initial?.id ?? newId());
  const session = useAuthStore((s) => s.session);

  const fee = Number(s.monthlyFeeRupees);
  const yearly = Number.isFinite(fee) && fee > 0 ? fee * 12 : 0;

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setS((p) => ({ ...p, [k]: v }));
  }

  /** Update start or end time for a specific class day. */
  function setDayTime(day: string, field: 'start' | 'end', value: string) {
    setS((p) => ({
      ...p,
      daySchedules: {
        ...p.daySchedules,
        [day]: { ...(p.daySchedules[day] ?? { start: '', end: '' }), [field]: value },
      },
    }));
  }

  /** When the day chips change, ensure every selected day has a schedule entry. */
  function handleDaysChange(days: string[]) {
    setS((p) => {
      // Default times: copy from first already-scheduled day (or empty)
      const firstExisting = days.find((d) => p.daySchedules[d]?.start);
      const defaultTimes: DayTimes = firstExisting
        ? p.daySchedules[firstExisting]!
        : { start: '', end: '' };
      const updated = { ...p.daySchedules };
      for (const d of days) {
        if (!updated[d]) updated[d] = { ...defaultTimes };
      }
      return { ...p, classDays: days, daySchedules: updated };
    });
  }

  // Expose submit() so a parent (e.g. a top-bar Save button) can trigger it.
  useImperativeHandle(ref, () => ({ submit: handleSubmit }));

  function handleSubmit() {
    const err = validate(s);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    const now = new Date().toISOString();
    // Build per-day schedule array (preserving day order)
    const scheduleArr = s.classDays.map((d) => ({
      day: d,
      start: s.daySchedules[d]?.start ?? '',
      end: s.daySchedules[d]?.end ?? '',
    }));
    // Derive shared times from the first day for backward compat (NOT NULL columns)
    const firstDay = s.classDays[0] ?? 'monday';
    const firstSched = s.daySchedules[firstDay] ?? { start: '', end: '' };

    const data: NewClass = {
      id: classId,
      teacherId,
      classType: s.classType,
      customClassType: s.classType === 'other' ? s.customClassType.trim() : null,
      grade: s.grade.trim(),
      batch: s.batch.trim(),
      subject: s.subject.trim(),
      language: s.language === 'Other' ? s.customLanguage.trim() : s.language,
      monthlyFeeCents: Math.round(Number(s.monthlyFeeRupees) * 100),
      location: s.location.trim() || null,
      remark: s.remark.trim() || null,
      imageUrl: s.imageUrl.trim() || null,
      isActive: s.isActive,
      classDay: s.classDays.join(','),
      classSchedule: JSON.stringify(scheduleArr),
      classStartTime: firstSched.start,
      classEndTime: firstSched.end,
      qrGraceMinutesBefore: Number(s.qrGraceMinutesBefore) || 30,
      paymentReminderDayOfMonth: s.paymentReminderDayOfMonth
        ? Number(s.paymentReminderDayOfMonth)
        : null,
      paymentReminderTime: s.paymentReminderTime.trim() || null,
      paymentReminderActive: s.paymentReminderActive,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      clientUpdatedAt: now,
    };
    onSubmit(data);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      <Section title="Class Type">
        <Chips
          colors={colors}
          options={CLASS_TYPES.map((t) => ({ key: t, label: t.toUpperCase() }))}
          value={s.classType}
          onChange={(v) => {
            const next = v as ClassType;
            set('classType', next);
            // Clear the grade when it doesn't belong to the new type's list
            // (e.g. switching A/L grade 12 → O/L which only has 1–11).
            const allowed = gradesForType(next);
            if (allowed.length > 0 && !allowed.includes(s.grade)) set('grade', '');
          }}
        />
        {s.classType === 'other' && (
          <View style={{ marginTop: 22 }}>
          <Field label="Custom Class Type" colors={colors}>
            <TextInput
              style={styles.input}
              value={s.customClassType}
              onChangeText={(v) => set('customClassType', v)}
              placeholder="e.g. Diploma"
              placeholderTextColor={colors.textMuted}
            />
          </Field>
          </View>
        )}
      </Section>

      <Section title="Basics">
        <Field label="Grade" colors={colors}>
          {s.classType === 'other' ? (
            <TextInput
              style={styles.input}
              value={s.grade}
              onChangeText={(v) => set('grade', v)}
              placeholder="e.g. Year 1"
              placeholderTextColor={colors.textMuted}
            />
          ) : (
            <Chips
              colors={colors}
              options={gradesForType(s.classType).map((g) => ({ key: g, label: g }))}
              value={s.grade}
              onChange={(v) => set('grade', v)}
            />
          )}
        </Field>
        <Field label="Batch / Group" colors={colors}>
          <TextInput
            style={styles.input}
            value={s.batch}
            onChangeText={(v) => set('batch', v)}
            placeholder="e.g. Group A"
            placeholderTextColor={colors.textMuted}
          />
        </Field>
        <Field label="Subject" colors={colors}>
          <TextInput
            style={styles.input}
            value={s.subject}
            onChangeText={(v) => set('subject', v)}
            placeholder="e.g. Maths"
            placeholderTextColor={colors.textMuted}
          />
        </Field>
        <Field label="Language Medium" colors={colors}>
          <Chips
            colors={colors}
            options={LANGUAGES.map((l) => ({ key: l, label: l }))}
            value={s.language}
            onChange={(v) => set('language', v)}
          />
          {s.language === 'Other' && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={s.customLanguage}
              onChangeText={(v) => set('customLanguage', v)}
              placeholder="Type language"
              placeholderTextColor={colors.textMuted}
            />
          )}
        </Field>
      </Section>

      <Section title="Fee">
        <Field label="Monthly Fee (LKR)" colors={colors}>
          <TextInput
            style={styles.input}
            value={s.monthlyFeeRupees}
            onChangeText={(v) => set('monthlyFeeRupees', v.replace(/[^\d.]/g, ''))}
            keyboardType="numeric"
            placeholder="e.g. 2500"
            placeholderTextColor={colors.textMuted}
          />
          {yearly > 0 && (
            <Text style={[styles.motivation, { color: colors.primary }]}>
              💡 One student can earn Rs. {yearly.toLocaleString()} per year.
            </Text>
          )}
        </Field>
      </Section>

      <Section title="Schedule">
        <Field label="Class Day(s)" colors={colors}>
          <MultiChips
            colors={colors}
            options={DAYS.map((d) => ({ key: d.key, label: d.label }))}
            values={s.classDays}
            onChange={handleDaysChange}
          />
          {s.classDays.length > 0 && (
            <Text style={{ marginTop: 6, fontSize: 12, color: colors.textMuted }}>
              Selected: {s.classDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
            </Text>
          )}
        </Field>

        {/* Per-day time rows */}
        {s.classDays.length > 0 && (
          <Field label="Class Times (per day)" colors={colors}>
            {s.classDays.map((day) => (
              <View key={day} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6, textTransform: 'capitalize' }}>
                  {day}
                </Text>
                <Row>
                  <View style={{ flex: 1 }}>
                    <TimePickerModal
                      label="Start"
                      value={s.daySchedules[day]?.start ?? ''}
                      onChange={(v) => setDayTime(day, 'start', v)}
                      placeholder="14:00"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TimePickerModal
                      label="End"
                      value={s.daySchedules[day]?.end ?? ''}
                      onChange={(v) => setDayTime(day, 'end', v)}
                      placeholder="16:00"
                    />
                  </View>
                </Row>
              </View>
            ))}
          </Field>
        )}

        <Field label="QR Grace Minutes (before class)" colors={colors}>
          <TextInput
            style={styles.input}
            value={s.qrGraceMinutesBefore}
            onChangeText={(v) => set('qrGraceMinutesBefore', v.replace(/[^\d]/g, ''))}
            keyboardType="numeric"
            placeholder="30"
            placeholderTextColor={colors.textMuted}
          />
        </Field>
      </Section>

      <Section title="Details">
        <Field label="Location *" colors={colors}>
          <TextInput
            style={styles.input}
            value={s.location}
            onChangeText={(v) => set('location', v)}
            placeholder="e.g. Main Hall, Room 2"
            placeholderTextColor={colors.textMuted}
          />
        </Field>
        <Field label="Remark" colors={colors}>
          <TextInput
            style={[styles.input, { height: 72, paddingTop: 10 }]}
            value={s.remark}
            onChangeText={(v) => set('remark', v)}
            placeholder="Optional notes"
            placeholderTextColor={colors.textMuted}
            multiline
          />
        </Field>
        <Field label="Class Image" colors={colors}>
          <View style={{ paddingVertical: 8 }}>
            <PhotoPickerButton
              r2Key={s.imageUrl}
              onUploaded={(key) => set('imageUrl', key)}
              accessToken={session?.access_token ?? ''}
              r2KeyBuilder={() => R2Paths.subjectImage(teacherId, classId)}
              label="Tap to upload class image"
              size={72}
            />
          </View>
        </Field>
      </Section>

      <Section title="Payment Reminder">
        <Row>
          <Field label="Day of Month" colors={colors} flex>
            <TextInput
              style={styles.input}
              value={s.paymentReminderDayOfMonth}
              onChangeText={(v) =>
                set('paymentReminderDayOfMonth', v.replace(/[^\d]/g, ''))
              }
              keyboardType="numeric"
              placeholder="e.g. 5"
              placeholderTextColor={colors.textMuted}
            />
          </Field>
          <Field label="Reminder Time" colors={colors} flex>
            <TimePickerModal
              label="Time"
              value={s.paymentReminderTime}
              onChange={(v) => set('paymentReminderTime', v)}
              placeholder="09:00"
            />
          </Field>
        </Row>
        <Toggle
          label="Reminder Active"
          value={s.paymentReminderActive}
          onChange={(v) => set('paymentReminderActive', v)}
          colors={colors}
        />
      </Section>

      <Section title="Status">
        <Toggle
          label="Class Active"
          value={s.isActive}
          onChange={(v) => set('isActive', v)}
          colors={colors}
        />
      </Section>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        {onCancel && (
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.btn,
              styles.btnSecondary,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.btn,
            styles.btnPrimary,
            (pressed || submitting) && { opacity: 0.85 },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.primaryText }]}>
            {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Class'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useThemeStore((s) => s.colors);
  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Field({
  label,
  colors,
  children,
  flex,
}: {
  label: string;
  colors: ThemeColors;
  children: React.ReactNode;
  flex?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12, flex: flex ? 1 : undefined }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>;
}

function Chips({
  options,
  value,
  onChange,
  colors,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [
              {
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : colors.border,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text
              style={{
                color: active ? colors.primaryText : colors.text,
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiChips({
  options,
  values,
  onChange,
  colors,
}: {
  options: { key: string; label: string }[];
  values: string[];
  onChange: (v: string[]) => void;
  colors: ThemeColors;
}) {
  function toggle(key: string) {
    if (values.includes(key)) {
      onChange(values.filter((v) => v !== key));
    } else {
      // Keep days in Mon→Sun order
      const order = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const next = [...values, key].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      onChange(next);
    }
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = values.includes(o.key);
        return (
          <Pressable
            key={o.key}
            onPress={() => toggle(o.key)}
            style={({ pressed }) => [
              {
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: active ? 2 : 1,
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : colors.border,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text
              style={{
                color: active ? colors.primaryText : colors.text,
                fontWeight: '700',
                fontSize: 13,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colors: ThemeColors;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        borderRadius: 10,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    content: { padding: 16, paddingBottom: 120 },
    input: {
      height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      color: c.text,
      fontSize: 15,
    },
    motivation: { marginTop: 8, fontSize: 13, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    btn: {
      flex: 1,
      height: 48,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: { backgroundColor: c.primary },
    btnSecondary: {
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    btnText: { fontWeight: '700', fontSize: 15 },
    error: { color: c.danger, marginBottom: 12, fontSize: 13 },
  });
}
