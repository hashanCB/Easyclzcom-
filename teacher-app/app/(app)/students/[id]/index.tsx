import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StudentForm } from '../../../../components/StudentForm';
import {
  saveStudent,
  setStudentActive,
  confirmStudentForBilling,
  useClassOptions,
  useStudent,
  useStudentClasses,
} from '../../../../lib/students';
import { useAuthStore } from '../../../../lib/auth/store';
import { useThemeStore } from '../../../../lib/theme/store';
import { useStudentExamTrend } from '../../../../lib/exams/hooks';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTIONS_URL } from '../../../../lib/constants';
import { effectiveFeeCents } from '../../../../lib/payments/fee';
import { useScreenTitle } from '../../../../lib/ui/header';

type Mode = 'profile' | 'edit';

export default function StudentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? 'local';
  const { student, loading, refresh } = useStudent(id);
  const { enrollments, refresh: refreshEnrollments } = useStudentClasses(id);
  const classOptions = useClassOptions(teacherId);
  const session = useAuthStore((s) => s.session);
  const [mode, setMode] = useState<Mode>('profile');
  useScreenTitle(mode === 'edit' ? 'Edit Student' : 'Student Profile');
  const [saving, setSaving] = useState(false);

  // Portal link status for this specific student
  const [portalLinked,    setPortalLinked]    = useState<boolean | null>(null); // null = loading
  const [portalActive,    setPortalActive]    = useState(true);  // is_active
  const [portalRemoving,  setPortalRemoving]  = useState(false);
  const [portalToggling,  setPortalToggling]  = useState(false);
  const portalFetchedRef = useRef(false);

  // Fetch portal link status once when we have the student + session
  useEffect(() => {
    if (!id || !session?.access_token || portalFetchedRef.current) return;
    portalFetchedRef.current = true;
    fetch(
      `${SUPABASE_URL}/rest/v1/student_account_links?select=id,is_active&student_id=eq.${encodeURIComponent(id as string)}&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          Accept: 'application/json',
        },
      },
    )
      .then((r) => r.json())
      .then((rows: unknown) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setPortalLinked(true);
          setPortalActive((rows as { is_active?: boolean }[])[0]?.is_active !== false);
        } else {
          setPortalLinked(false);
          setPortalActive(true);
        }
      })
      .catch(() => setPortalLinked(false));
  }, [id, session?.access_token]);

  async function handleTogglePortalActive() {
    if (!session?.access_token || !id) return;
    const willSuspend = portalActive;
    Alert.alert(
      willSuspend ? 'Suspend Portal Access' : 'Restore Portal Access',
      willSuspend
        ? `Suspend ${student?.name ?? 'this student'}'s portal access? They won't be able to chat or use portal features for your class. The link is kept — you can restore it anytime.`
        : `Restore ${student?.name ?? 'this student'}'s portal access? They will be able to use the portal for your class again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: willSuspend ? 'Suspend' : 'Restore',
          style: willSuspend ? 'destructive' : 'default',
          onPress: async () => {
            setPortalToggling(true);
            try {
              const res = await fetch(`${FUNCTIONS_URL}/teacher_set_link_active`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ student_id: id, is_active: !portalActive }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                Alert.alert('Failed', (data as { error?: { message?: string } })?.error?.message ?? 'Could not update portal access.');
              } else {
                setPortalActive((v) => !v);
              }
            } catch (e: unknown) {
              Alert.alert('Failed', (e as Error).message);
            } finally {
              setPortalToggling(false);
            }
          },
        },
      ],
    );
  }

  async function handleRemovePortalLink() {
    if (!session?.access_token || !id) return;
    Alert.alert(
      'Remove Portal Access',
      `Remove ${student?.name ?? 'this student'}'s portal link? They can re-join later using the class code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setPortalRemoving(true);
            try {
              const res = await fetch(`${FUNCTIONS_URL}/teacher_unlink_portal`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ student_id: id }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                Alert.alert('Failed', (data as { error?: { message?: string } })?.error?.message ?? 'Could not remove portal link.');
              } else {
                setPortalLinked(false);
              }
            } catch (e: unknown) {
              Alert.alert('Failed', (e as Error).message);
            } finally {
              setPortalRemoving(false);
            }
          },
        },
      ],
    );
  }

  function toggleActive() {
    if (!student) return;
    try {
      setStudentActive(student.id, !student.isActive);
      refresh();
    } catch (e: unknown) {
      Alert.alert('Failed', (e as Error).message);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {loading ? (
        <View style={styles.center}>
          <Text style={[styles.info, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      ) : !student ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.border} />
          <Text style={[styles.info, { color: colors.textMuted }]}>Student not found.</Text>
        </View>
      ) : mode === 'edit' ? (
        <StudentForm
          initial={student}
          initialEnrollments={enrollments.map((e) => ({
            classId: e.classId,
            feeType: e.feeType,
            customFeeCents: e.customFeeCents,
          }))}
          teacherId={teacherId}
          classOptions={classOptions}
          submitting={saving}
          onCancel={() => setMode('profile')}
          onSubmit={(data, opts) => {
            setSaving(true);
            try {
              saveStudent(data, student.id, opts?.enrollments);
              setSaving(false);
              setMode('profile');
              refresh();
              refreshEnrollments();
            } catch (e: unknown) {
              setSaving(false);
              Alert.alert('Could not save', (e as Error).message);
            }
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
          {/* Identity card */}
          <View style={[styles.identityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarLetter}>{student.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>{student.name}</Text>
              <Text style={[styles.code, { color: colors.textMuted }]}>{student.studentCode}</Text>
              <View style={styles.badgeRow}>
                <Text
                  style={[
                    styles.badge,
                    {
                      color: student.isActive ? colors.primary : colors.textMuted,
                      borderColor: student.isActive ? colors.primary : colors.border,
                      backgroundColor: student.isActive ? colors.primary + '12' : 'transparent',
                    },
                  ]}
                >
                  {student.isActive ? 'Active' : 'Deactivated'}
                </Text>
                {student.gender ? (
                  <Text style={[styles.badge, { color: colors.textMuted, borderColor: colors.border }]}>
                    {student.gender}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Billing gate banner — shown only for students who joined via the
              class code and have not yet paid or been manually confirmed. */}
          {student.joinStatus === 'pending_payment' && (
            <BillingPendingBanner
              studentName={student.name}
              colors={colors}
              onConfirm={() => {
                confirmStudentForBilling(student.id);
                refresh();
              }}
            />
          )}

          <Section title="Student Portal" icon="globe-outline" iconColor="#059669" colors={colors}>
            <Row label="Student ID" value={student.studentCode} colors={colors} mono />

            {/* Portal connection status */}
            <View style={[styles.portalStatusRow, { borderTopColor: colors.border }]}>
              <View style={styles.portalStatusLeft}>
                <View style={[styles.portalDot, {
                  backgroundColor:
                    portalLinked === null ? colors.textMuted
                    : !portalLinked ? colors.border
                    : portalActive ? '#059669'
                    : '#f59e0b',
                }]} />
                <Text style={[styles.portalStatusText, { color: colors.text }]}>
                  {portalLinked === null
                    ? 'Checking…'
                    : !portalLinked
                    ? 'Not joined portal'
                    : portalActive
                    ? 'Portal connected'
                    : 'Portal suspended'}
                </Text>
              </View>

              {/* Action buttons — only shown when linked */}
              {portalLinked && (
                <View style={styles.portalActionRow}>
                  {/* Suspend / Restore */}
                  <Pressable
                    onPress={handleTogglePortalActive}
                    disabled={portalToggling}
                    style={({ pressed }) => [
                      styles.portalActionBtn,
                      { borderColor: portalActive ? '#fbbf24' : '#6ee7b7',
                        backgroundColor: portalActive ? '#fffbeb' : '#ecfdf5' },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                  >
                    {portalToggling
                      ? <ActivityIndicator size="small" color={portalActive ? '#d97706' : '#059669'} />
                      : <>
                          <Ionicons
                            name={portalActive ? 'pause-circle-outline' : 'play-circle-outline'}
                            size={13}
                            color={portalActive ? '#d97706' : '#059669'}
                          />
                          <Text style={[styles.portalActionText, { color: portalActive ? '#d97706' : '#059669' }]}>
                            {portalActive ? 'Suspend' : 'Restore'}
                          </Text>
                        </>}
                  </Pressable>

                  {/* Remove entirely */}
                  <Pressable
                    onPress={handleRemovePortalLink}
                    disabled={portalRemoving}
                    style={({ pressed }) => [styles.unlinkBtn, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Remove portal link"
                  >
                    {portalRemoving
                      ? <ActivityIndicator size="small" color="#dc2626" />
                      : <><Ionicons name="unlink-outline" size={13} color="#dc2626" />
                         <Text style={styles.unlinkBtnText}>Remove</Text></>}
                  </Pressable>
                </View>
              )}
            </View>
          </Section>

          <Section title="Academic" icon="school-outline" iconColor="#4f46e5" colors={colors}>
            {/* One row per class the student is in, each with its own fee. Falls
                back to the single primary class for older students. */}
            {(enrollments.length > 0
              ? enrollments.map((e) => ({
                  classId: e.classId,
                  feeType: e.feeType,
                  customFeeCents: e.customFeeCents,
                }))
              : [{ classId: student.classId, feeType: student.feeType, customFeeCents: student.customFeeCents }]
            ).map((e) => (
              <Row
                key={e.classId}
                label={classLabel(classOptions, e.classId)}
                value={feeLabel(classOptions, e)}
                colors={colors}
              />
            ))}
            <Row label="Grade" value={student.grade || '—'} colors={colors} />
            <Row label="Batch" value={student.batch || '—'} colors={colors} />
            <Row label="Subject" value={student.subject || '—'} colors={colors} />
            <Row label="Language" value={student.language || '—'} colors={colors} />
          </Section>

          <ExamHistorySection
            studentId={student.id}
            classId={student.classId}
            colors={colors}
          />

          <Section title="Contact" icon="call-outline" iconColor="#0891b2" colors={colors}>
            <Row label="Phone" value={student.studentPhone || '—'} colors={colors} />
            <Row label="Address" value={student.address || '—'} colors={colors} />
            <Row label="Parent name" value={student.parentName || '—'} colors={colors} />
            <Row label="Parent phone" value={student.parentMobile || '—'} colors={colors} />
            <Row label="Parent WhatsApp" value={student.parentWhatsapp || '—'} colors={colors} />
            <Row label="Emergency" value={student.emergencyContact || '—'} colors={colors} />
          </Section>

          <View style={styles.actions}>
            <Pressable
              onPress={() => router.push(`/(app)/students/${student.id}/qr`)}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="qr-code-outline" size={18} color={colors.primaryText} />
              <Text style={[styles.btnText, { color: colors.primaryText }]}>QR / ID Card</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('edit')}
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={18} color={colors.text} />
              <Text style={[styles.btnText, { color: colors.text }]}>Edit</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={toggleActive}
            style={({ pressed }) => [
              styles.deactivateBtn,
              {
                borderColor: student.isActive ? colors.danger : colors.primary,
                backgroundColor: student.isActive ? colors.danger + '10' : colors.primary + '10',
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <Ionicons
              name={student.isActive ? 'person-remove-outline' : 'person-add-outline'}
              size={16}
              color={student.isActive ? colors.danger : colors.primary}
            />
            <Text style={[styles.btnText, { fontSize: 14, color: student.isActive ? colors.danger : colors.primary }]}>
              {student.isActive ? 'Deactivate Student' : 'Activate Student'}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function BillingPendingBanner({
  studentName,
  colors,
  onConfirm,
}: {
  studentName: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onConfirm: () => void;
}) {
  return (
    <View style={[styles.billingBanner, { borderColor: '#fcd34d' }]}>
      <View style={styles.billingBannerTop}>
        <Ionicons name="wallet-outline" size={16} color="#92400e" />
        <Text style={styles.billingBannerTitle}>Not yet counted in billing</Text>
      </View>
      <Text style={styles.billingBannerBody}>
        {studentName} joined via the class code and has not paid yet. They are excluded from outstanding-fee totals until their first payment is recorded.
      </Text>
      <Pressable
        onPress={onConfirm}
        style={({ pressed }) => [styles.billingConfirmBtn, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
      >
        <Ionicons name="checkmark-circle-outline" size={15} color="#92400e" />
        <Text style={styles.billingConfirmBtnText}>Confirm for billing now</Text>
      </Pressable>
    </View>
  );
}

function classLabel(opts: { id: string; label: string }[], classId: string): string {
  return opts.find((o) => o.id === classId)?.label ?? classId;
}

/** "Free" / "Rs 1,500 (custom)" / "Rs 2,000 (class)" for the profile fee row. */
function feeLabel(
  opts: { id: string; feeCents: number }[],
  student: { classId: string; feeType?: string | null; customFeeCents?: number | null },
): string {
  if (student.feeType === 'free') return 'Free';
  const classFeeCents = opts.find((o) => o.id === student.classId)?.feeCents ?? 0;
  const cents = effectiveFeeCents(student, classFeeCents);
  const rs = `Rs ${Math.round(cents / 100).toLocaleString()}`;
  return student.feeType === 'custom' ? `${rs} (custom)` : `${rs} (class)`;
}

function Section({
  title,
  icon,
  iconColor,
  children,
  colors,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconBox, { backgroundColor: iconColor + '18' }]}>
          <Ionicons name={icon} size={14} color={iconColor} />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  colors,
  mono,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  mono?: boolean;
}) {
  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          { color: colors.text },
          mono && { fontFamily: 'monospace' },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function ExamHistorySection({
  studentId,
  classId,
  colors,
}: {
  studentId: string;
  classId: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  const router = useRouter();
  const { trend3m, trend6m, loading } = useStudentExamTrend(studentId, classId);
  const [range, setRange] = useState<'3m' | '6m'>('3m');
  const trend = range === '3m' ? trend3m : trend6m;

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconBox, { backgroundColor: '#a855f718' }]}>
          <Ionicons name="podium-outline" size={14} color="#a855f7" />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.textMuted, flex: 1 }]}>EXAM HISTORY</Text>
        <View style={styles.rangeRow}>
          <Pressable
            onPress={() => setRange('3m')}
            style={[styles.rangePill, { borderColor: range === '3m' ? colors.primary : colors.border, backgroundColor: range === '3m' ? colors.primary : 'transparent' }]}
          >
            <Text style={[styles.rangeText, { color: range === '3m' ? '#fff' : colors.text }]}>3M</Text>
          </Pressable>
          <Pressable
            onPress={() => setRange('6m')}
            style={[styles.rangePill, { borderColor: range === '6m' ? colors.primary : colors.border, backgroundColor: range === '6m' ? colors.primary : 'transparent' }]}
          >
            <Text style={[styles.rangeText, { color: range === '6m' ? '#fff' : colors.text }]}>6M</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.textMuted} size="small" />
      ) : trend.items.length === 0 ? (
        <Text style={[styles.trendEmpty, { color: colors.textMuted }]}>
          No exams in the last {range === '3m' ? '3' : '6'} months.
        </Text>
      ) : (
        <>
          <View style={[styles.trendSummary, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.trendSumLabel, { color: colors.textMuted }]}>Average %</Text>
              <Text style={[styles.trendSumValue, { color: colors.text }]}>{trend.averagePct}%</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={[styles.trendSumLabel, { color: colors.textMuted }]}>Exams</Text>
              <Text style={[styles.trendSumValue, { color: colors.text }]}>{trend.items.length}</Text>
            </View>
          </View>

          {trend.items.map((it) => {
            const pctColor = it.pct >= 75 ? '#059669' : it.pct >= 50 ? '#d97706' : '#dc2626';
            return (
              <Pressable
                key={it.exam.id}
                onPress={() => router.push({ pathname: '/(app)/exams/[id]/report', params: { id: it.exam.id } })}
                style={({ pressed }) => [
                  styles.trendRow,
                  { borderTopColor: colors.border },
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trendTitle, { color: colors.text }]} numberOfLines={1}>{it.exam.title}</Text>
                  <Text style={[styles.trendMeta, { color: colors.textMuted }]}>
                    {it.exam.examDate}  ·  Class avg {it.classAvgPct}%
                    {it.rank ? `  ·  Rank #${it.rank}/${it.classSize}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.trendMark, { color: colors.text }]}>
                    {it.mark}/{it.exam.totalMarks}
                  </Text>
                  <Text style={[styles.trendPct, { color: pctColor }]}>{it.pct}%</Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 4,
  },
  headerAction: {
    width: 80,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 8,
  },
  headerActionText: { fontSize: 14, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  info: { fontSize: 14 },

  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700' },
  code: { fontSize: 13, marginTop: 2, fontFamily: 'monospace' },
  badgeRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },

  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  rowLabel: { width: 130, fontSize: 13 },
  rowValue: { flex: 1, fontSize: 14, fontWeight: '500' },

  rangeRow: { flexDirection: 'row', gap: 6 },
  rangePill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  rangeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  trendEmpty: { fontSize: 13, paddingVertical: 8, fontStyle: 'italic' },
  trendSummary: {
    flexDirection: 'row', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4,
  },
  trendSumLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  trendSumValue: { fontSize: 18, fontWeight: '800', marginTop: 2, letterSpacing: -0.3 },
  trendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  trendTitle: { fontSize: 14, fontWeight: '600' },
  trendMeta: { fontSize: 11, marginTop: 2 },
  trendMark: { fontSize: 15, fontWeight: '700' },
  trendPct: { fontSize: 11, fontWeight: '700', marginTop: 1 },

  portalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  portalStatusLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  portalDot: { width: 8, height: 8, borderRadius: 4 },
  portalStatusText: { fontSize: 13 },
  portalActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  portalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    minHeight: 30,
  },
  portalActionText: { fontSize: 12, fontWeight: '600' },

  unlinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    minHeight: 30,
  },
  unlinkBtnText: { fontSize: 12, fontWeight: '600', color: '#dc2626' },

  portalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  portalBtnText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  deactivateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 48,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    minHeight: 48,
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth },
  btnText: { fontWeight: '700', fontSize: 15 },

  billingBanner: {
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: '#fffbeb',
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  billingBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  billingBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400e' },
  billingBannerBody: { fontSize: 12.5, lineHeight: 18, color: '#78350f' },
  billingConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  billingConfirmBtnText: { fontSize: 13, fontWeight: '700', color: '#92400e' },
});
