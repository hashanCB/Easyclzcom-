import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../../lib/theme/store';
import { useAuthStore } from '../../../../lib/auth/store';
import { usePayment, saveCorrection } from '../../../../lib/payments/hooks';
import { useStudent } from '../../../../lib/students/hooks';
import { newId } from '../../../../lib/uuid';
import { useScreenTitle } from '../../../../lib/ui/header';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function statusColor(status: string): string {
  if (status === 'paid') return '#059669';
  if (status === 'partial') return '#f59e0b';
  return '#6b7280';
}

type CorrectionType = 'correction' | 'refund';

export default function PaymentDetailScreen() {
  useScreenTitle('Payment Detail');
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? 'local';

  const { payment, corrections, loading, refresh } = usePayment(id);
  const { student } = useStudent(payment?.studentId);

  const [modalOpen, setModalOpen] = useState(false);
  const [corrType, setCorrType] = useState<CorrectionType>('correction');
  const [amountStr, setAmountStr] = useState('');
  const [corrRemark, setCorrRemark] = useState('');
  const [saving, setSaving] = useState(false);

  const styles = useMemo(() => buildStyles(colors), [colors]);

  async function handleSaveCorrection() {
    if (!payment) return;
    const amt = Number(amountStr);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.');
      return;
    }
    if (!corrRemark.trim()) {
      Alert.alert('Remark required', 'Please enter a reason for the correction.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const signed = corrType === 'refund' ? -Math.round(amt * 100) : Math.round(amt * 100);
      saveCorrection({
        id: newId(),
        teacherId,
        paymentId: payment.id,
        type: corrType,
        amountCents: signed,
        remark: corrRemark.trim(),
        createdAt: now,
        updatedAt: now,
      });
      setModalOpen(false);
      setAmountStr('');
      setCorrRemark('');
      refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textMuted }}>Loading…</Text>
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 8 }]}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.border} />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Payment not found.</Text>
      </View>
    );
  }

  const netCents = payment.amountCents + corrections.reduce((s, c) => s + c.amountCents, 0);
  const sColor = statusColor(payment.status);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.scroll}>
        {/* Main payment card */}
        <View style={styles.card}>
          {/* Amount hero */}
          <View style={styles.amountHero}>
            <Text style={[styles.amountLabel, { color: colors.textMuted }]}>{monthLabel(payment.month)}</Text>
            <Text style={[styles.amountValue, { color: colors.text }]}>
              Rs {(payment.amountCents / 100).toLocaleString()}
            </Text>
            <Text style={[styles.statusBadge, { color: sColor, borderColor: sColor, backgroundColor: sColor + '12' }]}>
              {payment.status.toUpperCase()}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Student row */}
          <Pressable
            onPress={() => student && router.push(`/(app)/students/${student.id}`)}
            style={({ pressed }) => [styles.studentRow, pressed && { backgroundColor: colors.surfaceAlt }]}
            accessibilityRole="button"
          >
            <View style={[styles.studentAvatar, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="person-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.studentName, { color: colors.text }]}>{student?.name ?? '—'}</Text>
              <Text style={[styles.studentCode, { color: colors.textMuted }]}>
                {student?.studentCode ?? payment.studentId.slice(0, 8)}
              </Text>
            </View>
            {student && (
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            )}
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <InfoRow label="Method" value={payment.method.replace('_', ' ')} colors={colors} />
          {'location' in payment && payment.location ? <InfoRow label="Location" value={payment.location as string} colors={colors} /> : null}
          <InfoRow label="Collected" value={payment.collectedAt.slice(0, 10)} colors={colors} />
          {payment.remark ? <InfoRow label="Remark" value={payment.remark} colors={colors} /> : null}
        </View>

        {/* Corrections section */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Corrections & Adjustments</Text>

        {corrections.length === 0 ? (
          <Text style={[styles.noCorrections, { color: colors.textMuted }]}>No corrections recorded.</Text>
        ) : (
          corrections.map((c) => (
            <View key={c.id} style={[styles.corrCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.corrTop}>
                <View style={[styles.corrIconBox, { backgroundColor: (c.amountCents < 0 ? colors.danger : '#059669') + '18' }]}>
                  <Ionicons
                    name={c.amountCents < 0 ? 'arrow-undo-outline' : 'add-circle-outline'}
                    size={16}
                    color={c.amountCents < 0 ? colors.danger : '#059669'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.corrType, { color: c.amountCents < 0 ? colors.danger : '#059669' }]}>
                    {c.type.toUpperCase()}
                  </Text>
                  {c.remark ? <Text style={[styles.corrRemark, { color: colors.textMuted }]}>{c.remark}</Text> : null}
                  <Text style={[styles.corrDate, { color: colors.textMuted }]}>{c.createdAt.slice(0, 10)}</Text>
                </View>
                <Text style={[styles.corrAmt, { color: c.amountCents < 0 ? colors.danger : '#059669' }]}>
                  {c.amountCents < 0 ? '−' : '+'}Rs {(Math.abs(c.amountCents) / 100).toLocaleString()}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* Net total */}
        {corrections.length > 0 && (
          <View style={[styles.netRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.netLabel, { color: colors.textMuted }]}>Net Amount</Text>
            <Text style={[styles.netAmt, { color: netCents < 0 ? colors.danger : colors.text }]}>
              Rs {(netCents / 100).toLocaleString()}
            </Text>
          </View>
        )}

        {/* Add correction button */}
        <Pressable
          onPress={() => setModalOpen(true)}
          style={({ pressed }) => [styles.corrBtn, { borderColor: colors.primary }, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.corrBtnText, { color: colors.primary }]}>Add Correction / Refund</Text>
        </Pressable>
      </ScrollView>

      {/* Correction modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setModalOpen(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Correction</Text>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Type</Text>
            <View style={styles.chipRow}>
              {(['correction', 'refund'] as CorrectionType[]).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setCorrType(t)}
                  style={[styles.chip, corrType === t && styles.chipActive]}
                >
                  <Text style={[styles.chipText, corrType === t && styles.chipTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Amount (Rs)</Text>
            <TextInput
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="e.g. 500"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Reason (required)</Text>
            <TextInput
              value={corrRemark}
              onChangeText={setCorrRemark}
              placeholder="Reason for adjustment…"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
              style={[styles.input, { height: 64, textAlignVertical: 'top', paddingTop: 10, color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
            />

            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setModalOpen(false)}
                style={[styles.cancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveCorrection}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              >
                <Text style={[styles.saveBtnText, { color: colors.primaryText }]}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function InfoRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useThemeStore.getState>['colors'] }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text style={{ fontSize: 13, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    headerRight: { width: 44 },

    scroll: { padding: 16, paddingBottom: 48 },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 20,
    },
    amountHero: { alignItems: 'center', paddingVertical: 8 },
    amountLabel: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
    amountValue: { fontSize: 32, fontWeight: '800', marginBottom: 8 },
    statusBadge: {
      fontSize: 12,
      fontWeight: '700',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      overflow: 'hidden',
      letterSpacing: 0.5,
    },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },

    studentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      borderRadius: 8,
      marginHorizontal: -4,
      paddingHorizontal: 4,
    },
    studentAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    studentName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    studentCode: { fontSize: 12, fontFamily: 'monospace' },

    sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
    noCorrections: { fontSize: 13, marginBottom: 16 },

    corrCard: {
      borderRadius: 12,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 8,
    },
    corrTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    corrIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    corrType: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    corrRemark: { fontSize: 13, marginTop: 2 },
    corrDate: { fontSize: 11, marginTop: 4 },
    corrAmt: { fontSize: 15, fontWeight: '800' },

    netRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      marginBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    netLabel: { fontSize: 14, fontWeight: '600' },
    netAmt: { fontSize: 20, fontWeight: '800' },

    corrBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderRadius: 14,
      paddingVertical: 14,
      marginTop: 8,
      minHeight: 52,
    },
    corrBtnText: { fontSize: 15, fontWeight: '600' },

    modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: '#d1d5db',
      alignSelf: 'center',
      marginBottom: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
    fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, marginRight: 8, marginBottom: 8 },
    chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
    chipText: { fontSize: 13, color: colors.text },
    chipTextActive: { color: colors.primaryText, fontWeight: '600' },
    input: { height: 48, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 15 },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
    cancelBtnText: { fontSize: 15, fontWeight: '600' },
    saveBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    saveBtnText: { fontSize: 15, fontWeight: '700' },
  });
}
