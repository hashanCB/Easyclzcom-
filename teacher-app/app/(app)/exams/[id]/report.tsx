// Exam report (U42) — rank table, class avg/highest/lowest, PDF/print, per-row SMS.
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../../lib/theme/store';
import { useScreenTitle } from '../../../../lib/ui/header';
import { useAuthStore } from '../../../../lib/auth/store';
import { useExam } from '../../../../lib/exams/hooks';
import { useStudentsList, useClassOptions } from '../../../../lib/students/hooks';
import { useExamMarks } from '../../../../lib/marks/hooks';
import {
  computeExamReport,
  buildExamReportPdfHtml,
  type ExamRankRow,
} from '../../../../lib/exams/report';
import { sendSms } from '../../../../lib/messages/sms';
import {
  DEFAULT_BODIES,
  renderTemplate,
  type TemplateLanguage,
} from '../../../../lib/messages/templates';
import { messageTemplatesRepo } from '../../../../db/repositories/messageTemplatesRepo';

function getPrint() {
  if (Platform.OS === 'web') return null;
  try { return require('expo-print') as typeof import('expo-print'); }
  catch { return null; }
}

const LANG_FALLBACK: TemplateLanguage = 'english';

export default function ExamReportScreen() {
  const { id: examId } = useLocalSearchParams<{ id: string }>();
  useScreenTitle('Exam Report');
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const teacherId = teacher?.id ?? 'local';

  const { exam, loading: examLoading } = useExam(examId);
  const { students } = useStudentsList({
    teacherId,
    classId: exam?.classId,
    status: 'active',
  });
  const { marks, loading: marksLoading, refresh } = useExamMarks(examId);
  const classOptions = useClassOptions(teacherId);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const [confirmRow, setConfirmRow] = useState<ExamRankRow | null>(null);
  const [smsBusy, setSmsBusy] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // null = no confirm; 'all' = send to everyone; 'selected' = send to ticked rows.
  const [confirmKind, setConfirmKind] = useState<'all' | 'selected' | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const report = useMemo(
    () => (exam ? computeExamReport(exam, students, marks) : null),
    [exam, students, marks],
  );

  const classLabel = useMemo(() => {
    if (!exam) return '';
    return classOptions.find((c) => c.id === exam.classId)?.label
      ?? `${exam.subject} · ${exam.batch} (Grade ${exam.grade})`;
  }, [exam, classOptions]);

  async function exportPdf() {
    const print = getPrint();
    if (!print) { Alert.alert('Not supported', 'PDF export is not available on web.'); return; }
    if (!exam || !report) return;
    try {
      const html = buildExamReportPdfHtml({ exam, classLabel, report });
      await print.printAsync({ html });
    } catch (e: unknown) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  async function openSmsConfirm(row: ExamRankRow) {
    if (row.mark === null) {
      Alert.alert('No mark', 'Enter a mark for this student before sending the result.');
      return;
    }
    const phone = row.student.parentWhatsapp || row.student.parentMobile || row.student.studentPhone;
    if (!phone) {
      Alert.alert('No phone', `${row.student.name} has no parent phone or WhatsApp on file.`);
      return;
    }
    setConfirmRow(row);
  }

  // Phone a result SMS should go to (parent WhatsApp → parent mobile → student).
  function rowPhone(row: ExamRankRow): string | null {
    return row.student.parentWhatsapp || row.student.parentMobile || row.student.studentPhone || null;
  }

  // Rows that can actually receive a result: has a mark AND a phone on file.
  const eligibleRows = useMemo(
    () => report?.rows.filter((r) => r.mark !== null && rowPhone(r)) ?? [],
    [report],
  );

  // Build the SMS payload for one row. Returns null if the row has no mark/phone.
  // `tmplCache` reuses the looked-up template per language so bulk sends only hit
  // the DB once per distinct language.
  async function buildRowMessage(
    row: ExamRankRow,
    tmplCache: Map<string, string>,
  ): Promise<{ recipient_phone: string; body: string; student_id: string; class_id: string } | null> {
    if (!exam || row.mark === null) return null;
    const phone = rowPhone(row);
    if (!phone) return null;

    const studentLang = (row.student.language || LANG_FALLBACK) as TemplateLanguage;
    let body = tmplCache.get(studentLang);
    if (body === undefined) {
      const tmpl = await messageTemplatesRepo
        .findDefaultForType(teacherId, 'exam_result', studentLang)
        .catch(() => null);
      body = tmpl?.body ?? DEFAULT_BODIES.exam_result;
      tmplCache.set(studentLang, body);
    }

    const rendered = renderTemplate(body, {
      student_name: row.student.name,
      parent_name: row.student.parentName || 'Parent',
      class_name: classLabel,
      grade: exam.grade,
      batch: exam.batch,
      subject: exam.subject,
      language: exam.language,
      exam_name: exam.title,
      marks: `${row.mark}/${exam.totalMarks}`,
      rank: row.rank ? `${row.rank}` : '—',
      teacher_name: teacher?.username || 'Teacher',
    });

    return { recipient_phone: phone, body: rendered, student_id: row.student.id, class_id: exam.classId };
  }

  async function sendResultSms() {
    if (!confirmRow || !exam || !session?.access_token) return;
    const row = confirmRow;

    setSmsBusy(true);
    try {
      const msg = await buildRowMessage(row, new Map());
      if (!msg) return;
      await sendSms('exam_result', [msg], session.access_token);
      setSentTo((s) => new Set(s).add(row.student.id));
      setConfirmRow(null);
      Alert.alert('Sent', `Result sent to ${msg.recipient_phone}.`);
    } catch (e: unknown) {
      Alert.alert('Send failed', (e as Error).message);
    } finally {
      setSmsBusy(false);
    }
  }

  // Eligible rows the teacher has ticked in select mode.
  const selectedRows = useMemo(
    () => eligibleRows.filter((r) => selected.has(r.student.id)),
    [eligibleRows, selected],
  );

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // Send to a given set of rows (used by both "send all" and "send selected").
  async function sendToRows(targetRows: ExamRankRow[]) {
    if (!exam || !session?.access_token || targetRows.length === 0) return;

    setBulkBusy(true);
    try {
      const tmplCache = new Map<string, string>();
      const messages: { recipient_phone: string; body: string; student_id: string; class_id: string }[] = [];
      for (const row of targetRows) {
        const msg = await buildRowMessage(row, tmplCache);
        if (msg) messages.push(msg);
      }
      if (messages.length === 0) return;

      await sendSms('exam_result', messages, session.access_token);
      setSentTo((s) => {
        const next = new Set(s);
        targetRows.forEach((r) => next.add(r.student.id));
        return next;
      });
      setConfirmKind(null);
      exitSelect();
      Alert.alert('Sent', `Result sent to ${messages.length} parent${messages.length === 1 ? '' : 's'}.`);
    } catch (e: unknown) {
      Alert.alert('Send failed', (e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  // Rows the active confirm dialog will send to.
  const confirmRows = confirmKind === 'selected' ? selectedRows : eligibleRows;

  const styles = buildStyles(colors);

  if (examLoading || marksLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header colors={colors} onPdf={exportPdf} canPdf={false} />
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!exam || !report) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header colors={colors} onPdf={exportPdf} canPdf={false} />
        <View style={styles.center}><Text style={{ color: colors.textMuted }}>Exam not found.</Text></View>
      </SafeAreaView>
    );
  }

  const { rows, stats } = report;

  return (
    <SafeAreaView style={styles.safe}>
      <Header colors={colors} onPdf={exportPdf} canPdf />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Exam meta */}
        <Text style={[styles.examTitle, { color: colors.text }]}>{exam.title}</Text>
        <Text style={[styles.examMeta, { color: colors.textMuted }]}>
          {classLabel}  ·  {exam.examDate}  ·  Out of {exam.totalMarks}
        </Text>

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard label="Class Avg" value={`${stats.classAvg}`} sub={`${stats.classAvgPct}%`} accent="#4f46e5" accentBg="#eef2ff" colors={colors} />
          <StatCard label="Highest" value={`${stats.highest}`} accent="#059669" accentBg="#ecfdf5" colors={colors} />
        </View>
        <View style={styles.statRow}>
          <StatCard label="Lowest" value={`${stats.lowest}`} accent="#dc2626" accentBg="#fef2f2" colors={colors} />
          <StatCard label="Entered" value={`${stats.entered}/${stats.total}`} accent="#0891b2" accentBg="#ecfeff" colors={colors} />
        </View>

        {/* Rank table */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RANK LIST</Text>
          {eligibleRows.length > 0 && (
            selectMode ? (
              <View style={styles.headerBtnGroup}>
                <Pressable
                  onPress={() => setSelected(new Set(eligibleRows.map((r) => r.student.id)))}
                  hitSlop={6}
                  style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.linkBtnText, { color: colors.primary }]}>Select all</Text>
                </Pressable>
                <Pressable
                  onPress={exitSelect}
                  hitSlop={6}
                  style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.linkBtnText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.headerBtnGroup}>
                <Pressable
                  onPress={() => setSelectMode(true)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.selectBtn,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                  accessibilityLabel="Select students to send results"
                >
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
                  <Text style={[styles.selectBtnText, { color: colors.primary }]}>Select</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmKind('all')}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.bulkBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                  ]}
                  accessibilityLabel={`Send results to all ${eligibleRows.length} students`}
                >
                  <Ionicons name="paper-plane" size={14} color="#fff" />
                  <Text style={styles.bulkBtnText}>Send all ({eligibleRows.length})</Text>
                </Pressable>
              </View>
            )
          )}
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No students in this class.</Text>
          </View>
        ) : (
          rows.map((r) => {
            const isUnranked = r.rank === null;
            const sent = sentTo.has(r.student.id);
            const canSend = r.mark !== null && !!rowPhone(r);
            const isChecked = selected.has(r.student.id);
            return (
              <Pressable
                key={r.student.id}
                onPress={selectMode && canSend ? () => toggleSelect(r.student.id) : undefined}
                disabled={!selectMode || !canSend}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: isChecked ? colors.primary + '12' : colors.surface,
                    borderColor: isChecked ? colors.primary : colors.border,
                    opacity: selectMode && !canSend ? 0.45 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {selectMode && (
                  <Ionicons
                    name={isChecked ? 'checkbox' : canSend ? 'square-outline' : 'remove-circle-outline'}
                    size={22}
                    color={isChecked ? colors.primary : colors.textMuted}
                  />
                )}
                <View style={[styles.rankBadge, { backgroundColor: isUnranked ? colors.surfaceAlt : '#eef2ff' }]}>
                  <Text style={[styles.rankText, { color: isUnranked ? colors.textMuted : '#4f46e5' }]}>
                    {isUnranked ? '—' : `#${r.rank}`}
                  </Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{r.student.name}</Text>
                  <Text style={[styles.rowCode, { color: colors.textMuted }]}>{r.student.studentCode}</Text>
                </View>
                <View style={styles.rowMark}>
                  {r.mark === null ? (
                    <Text style={[styles.markValMuted, { color: colors.textMuted }]}>—</Text>
                  ) : (
                    <>
                      <Text style={[styles.markVal, { color: colors.text }]}>{r.mark}</Text>
                      <Text style={[styles.markPct, { color: colors.textMuted }]}>{r.pct}%</Text>
                    </>
                  )}
                </View>
                {!selectMode && (
                  <Pressable
                    onPress={() => openSmsConfirm(r)}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.smsBtn,
                      {
                        backgroundColor: sent ? '#ecfdf5' : colors.surfaceAlt,
                        borderColor: sent ? '#059669' : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                    accessibilityLabel="Send result SMS"
                  >
                    <Ionicons
                      name={sent ? 'checkmark-done' : 'paper-plane-outline'}
                      size={16}
                      color={sent ? '#059669' : colors.primary}
                    />
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Bottom action bar — only while picking students */}
      {selectMode && (
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Text style={[styles.bottomBarCount, { color: colors.text }]}>
            {selectedRows.length} selected
          </Text>
          <Pressable
            onPress={() => selectedRows.length > 0 && setConfirmKind('selected')}
            disabled={selectedRows.length === 0}
            style={({ pressed }) => [
              styles.bottomBarBtn,
              {
                backgroundColor: selectedRows.length === 0 ? colors.surfaceAlt : colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons
              name="paper-plane"
              size={16}
              color={selectedRows.length === 0 ? colors.textMuted : '#fff'}
            />
            <Text
              style={[
                styles.bottomBarBtnText,
                { color: selectedRows.length === 0 ? colors.textMuted : '#fff' },
              ]}
            >
              Send to selected
            </Text>
          </Pressable>
        </View>
      )}

      {/* Confirm SMS modal */}
      <Modal transparent visible={!!confirmRow} animationType="fade" onRequestClose={() => setConfirmRow(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Send Result SMS?</Text>
            {confirmRow && (
              <Text style={[styles.modalBody, { color: colors.textMuted }]}>
                {confirmRow.student.name} ({confirmRow.student.studentCode}) — {confirmRow.mark}/{exam.totalMarks}
                {'\n'}
                <Text style={{ color: colors.text }}>
                  To: {confirmRow.student.parentWhatsapp || confirmRow.student.parentMobile || confirmRow.student.studentPhone}
                </Text>
              </Text>
            )}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setConfirmRow(null)}
                disabled={smsBusy}
                style={[styles.modalBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={sendResultSms}
                disabled={smsBusy}
                style={[styles.modalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                {smsBusy ? <ActivityIndicator color="#fff" /> :
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Send</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm bulk / selected SMS modal */}
      <Modal transparent visible={confirmKind !== null} animationType="fade" onRequestClose={() => setConfirmKind(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {confirmKind === 'selected' ? 'Send to selected?' : 'Send all results?'}
            </Text>
            <Text style={[styles.modalBody, { color: colors.textMuted }]}>
              This sends the result SMS to {confirmRows.length} parent
              {confirmRows.length === 1 ? '' : 's'}.
              {'\n'}
              Students with no mark or no phone are skipped.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setConfirmKind(null)}
                disabled={bulkBusy}
                style={[styles.modalBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => sendToRows(confirmRows)}
                disabled={bulkBusy}
                style={[styles.modalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                {bulkBusy ? <ActivityIndicator color="#fff" /> :
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>
                    {confirmKind === 'selected' ? 'Send' : 'Send all'}
                  </Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Header({
  colors, onPdf, canPdf,
}: {
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onPdf: () => void;
  canPdf: boolean;
}) {
  return (
    <View style={hStyles.actions}>
      <Pressable onPress={onPdf} disabled={!canPdf} hitSlop={8} style={hStyles.iconBtn}>
        <Ionicons name="print-outline" size={22} color={canPdf ? colors.primary : colors.textMuted} />
      </Pressable>
    </View>
  );
}

const hStyles = StyleSheet.create({
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    paddingHorizontal: 8, paddingTop: 4,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

function StatCard({
  label, value, sub, accent, accentBg, colors,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  accentBg: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  return (
    <View style={[scStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[scStyles.dot, { backgroundColor: accentBg }]}>
        <View style={[scStyles.dotInner, { backgroundColor: accent }]} />
      </View>
      <Text style={[scStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={scStyles.valueRow}>
        <Text style={[scStyles.value, { color: colors.text }]}>{value}</Text>
        {sub ? <Text style={[scStyles.sub, { color: colors.textMuted }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const scStyles = StyleSheet.create({
  card: {
    flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 4,
  },
  dot: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 11, fontWeight: '600' },
});

// ── Page styles ─────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    scroll: { padding: 16, paddingBottom: 64 },
    examTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    examMeta: { fontSize: 12, marginTop: 3, marginBottom: 16 },

    statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },

    sectionHeaderRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 14, marginBottom: 10,
    },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
      paddingLeft: 2,
    },
    headerBtnGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bulkBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    },
    bulkBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    selectBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
    },
    selectBtnText: { fontSize: 12, fontWeight: '700' },
    linkBtn: { paddingHorizontal: 8, paddingVertical: 6 },
    linkBtnText: { fontSize: 13, fontWeight: '700' },

    bottomBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    bottomBarCount: { fontSize: 14, fontWeight: '700' },
    bottomBarBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10,
    },
    bottomBarBtnText: { fontSize: 14, fontWeight: '700' },

    empty: { alignItems: 'center', paddingVertical: 56, gap: 12 },
    emptyText: { fontSize: 14, textAlign: 'center' },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, marginBottom: 8,
    },
    rankBadge: { width: 44, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    rankText: { fontSize: 13, fontWeight: '800', letterSpacing: -0.3 },
    rowMain: { flex: 1 },
    rowName: { fontSize: 14, fontWeight: '600' },
    rowCode: { fontSize: 11, marginTop: 1, fontFamily: 'monospace' },
    rowMark: { alignItems: 'flex-end', minWidth: 56 },
    markVal: { fontSize: 16, fontWeight: '800' },
    markValMuted: { fontSize: 16, fontWeight: '600' },
    markPct: { fontSize: 11, fontWeight: '600', marginTop: 1 },
    smsBtn: {
      width: 36, height: 36, borderRadius: 8, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center', marginLeft: 4,
    },

    modalBg: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    modalCard: {
      width: '100%', maxWidth: 380, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '700' },
    modalBody: { fontSize: 13, lineHeight: 20 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    modalBtn: {
      flex: 1, height: 44, borderRadius: 10, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    modalBtnText: { fontSize: 14, fontWeight: '700' },
  });
}
