import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useClassesList } from '../../../lib/classes/hooks';
import { formatClassDays } from '../../../lib/classes/formatDays';
import { useScreenTitle } from '../../../lib/ui/header';
import {
  fetchAssistants,
  fetchAssistantPermissions,
  updateAssistant,
  resetAssistantPassword,
  type Assistant,
  type AssistantClassPermission,
  type ResetPasswordResult,
} from '../../../lib/api/assistants';

type Permission = 'attendance' | 'payment' | 'both';

// Combine the two independent attendance/payment toggles into the single stored
// enum (null = neither). "both" = attendance + payment.
function combine(attendance: boolean, payment: boolean): Permission | null {
  if (attendance && payment) return 'both';
  if (attendance) return 'attendance';
  if (payment) return 'payment';
  return null;
}

export default function AssistantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useScreenTitle('Edit Assistant');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const { classes } = useClassesList();

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [classPerms, setClassPerms] = useState<{ class_id: string; permission: Permission | null; can_add_student: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newCreds, setNewCreds] = useState<ResetPasswordResult | null>(null);

  // Editable state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    try {
      const [all, perms] = await Promise.all([
        fetchAssistants(token),
        fetchAssistantPermissions(id!, token),
      ]);
      const found = all.find((a) => a.id === id);
      if (found) {
        setAssistant(found);
        setName(found.name);
        setPhone(found.phone);
        setIsActive(found.is_active);
      }
      setClassPerms(perms.map((p: AssistantClassPermission) => ({ class_id: p.class_id, permission: p.permission, can_add_student: !!p.can_add_student })));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  function toggleClass(classId: string) {
    setClassPerms((prev) => {
      const exists = prev.find((p) => p.class_id === classId);
      if (exists) return prev.filter((p) => p.class_id !== classId);
      return [...prev, { class_id: classId, permission: 'both', can_add_student: false }];
    });
  }

  function toggleAction(classId: string, action: 'attendance' | 'payment') {
    setClassPerms((prev) =>
      prev.map((p) => {
        if (p.class_id !== classId) return p;
        const att = p.permission === 'attendance' || p.permission === 'both';
        const pay = p.permission === 'payment' || p.permission === 'both';
        const next = action === 'attendance'
          ? combine(!att, pay)
          : combine(att, !pay);
        return { ...p, permission: next };
      }),
    );
  }

  function setCanAddStudent(classId: string, value: boolean) {
    setClassPerms((prev) =>
      prev.map((p) => (p.class_id === classId ? { ...p, can_add_student: value } : p)),
    );
  }

  // "All" shortcut: attendance + payment (both) AND can add students.
  function selectAll(classId: string) {
    setClassPerms((prev) =>
      prev.map((p) => (p.class_id === classId ? { ...p, permission: 'both', can_add_student: true } : p)),
    );
  }

  async function handleSave() {
    if (!name.trim()) return Alert.alert('Validation', 'Name is required.');
    if (!phone.trim()) return Alert.alert('Validation', 'Phone is required.');

    setSaving(true);
    try {
      await updateAssistant(
        id!,
        { name: name.trim(), phone: phone.trim(), is_active: isActive, class_permissions: classPerms },
        token,
      );
      Alert.alert('Saved', 'Assistant updated successfully.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update assistant');
    } finally {
      setSaving(false);
    }
  }

  function handleResetPassword() {
    if (!assistant) return;
    Alert.alert(
      'Reset Password',
      `Generate a new login PIN for ${assistant.name}? Their old PIN will stop working immediately. You'll see the new PIN once — share it with them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              const creds = await resetAssistantPassword(id!, token);
              setNewCreds(creds);
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to reset password');
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  }

  const styles = buildStyles(colors);
  const activeClasses = classes.filter((c) => c.isActive);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!assistant) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: colors.textMuted }}>Assistant not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.saveBtnText, { color: saving ? colors.textMuted : colors.primary }]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Basic info */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ASSISTANT DETAILS</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FieldRow label="Username" colors={colors}>
            <Text style={[styles.readOnly, { color: colors.textMuted }]}>@{assistant.username}</Text>
          </FieldRow>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <FieldRow label="Full Name" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </FieldRow>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <FieldRow label="Phone" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </FieldRow>
        </View>

        {/* Active toggle */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>STATUS</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleTitle, { color: colors.text }]}>Active Account</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                {isActive ? 'Assistant can log in and access classes.' : 'Login is blocked for this assistant.'}
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>

        {/* Security — reset password */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SECURITY</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={handleResetPassword}
            disabled={resetting}
            style={({ pressed }) => [styles.resetRow, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.resetIcon, { backgroundColor: '#fef3c7' }]}>
              {resetting
                ? <ActivityIndicator size="small" color="#d97706" />
                : <Ionicons name="key-outline" size={18} color="#d97706" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.resetTitle, { color: colors.text }]}>
                {resetting ? 'Resetting…' : 'Reset Password / PIN'}
              </Text>
              <Text style={[styles.resetSub, { color: colors.textMuted }]}>
                Generate a new login PIN if the assistant forgot theirs.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Class permissions */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>CLASS PERMISSIONS</Text>
        {activeClasses.length === 0 ? (
          <View style={[styles.noClasses, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text style={[styles.noClassesText, { color: colors.textMuted }]}>No active classes.</Text>
          </View>
        ) : (
          activeClasses.map((cls) => {
            const perm = classPerms.find((p) => p.class_id === cls.id);
            const selected = !!perm;
            return (
              <View key={cls.id} style={[styles.classCard, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border }]}>
                <Pressable onPress={() => toggleClass(cls.id)} style={styles.classRow}>
                  <View style={[styles.checkbox, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}>
                    {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={styles.classInfo}>
                    <Text style={[styles.className, { color: colors.text }]}>{cls.grade} · {cls.batch}</Text>
                    <Text style={[styles.classSub, { color: colors.textMuted }]}>{cls.subject} · {formatClassDays(cls.classDay)}</Text>
                  </View>
                </Pressable>
                {selected && (
                  <View style={[styles.permPicker, { borderTopColor: colors.border }]}>
                    <Text style={[styles.permLabel, { color: colors.textMuted }]}>Allowed actions</Text>
                    {(() => {
                      const attActive = perm?.permission === 'attendance' || perm?.permission === 'both';
                      const payActive = perm?.permission === 'payment' || perm?.permission === 'both';
                      const addActive = !!perm?.can_add_student;
                      const allActive = attActive && payActive && addActive;
                      return (
                        <View style={styles.permChips}>
                          <Chip label="Attendance" active={attActive} colors={colors} onPress={() => toggleAction(cls.id, 'attendance')} />
                          <Chip label="Payment" active={payActive} colors={colors} onPress={() => toggleAction(cls.id, 'payment')} />
                          <Chip label="Add student" active={addActive} colors={colors} onPress={() => setCanAddStudent(cls.id, !addActive)} />
                          <Chip label="All" active={allActive} colors={colors} outline onPress={() => selectAll(cls.id)} />
                        </View>
                      );
                    })()}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* New-password modal (shown once after a reset) */}
      <Modal visible={!!newCreds} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalIconBox, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="key" size={32} color="#d97706" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New PIN Generated</Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>
              Share this with the assistant. It cannot be shown again — if lost, reset it once more.
            </Text>
            <View style={[styles.credBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <View style={styles.credRow}>
                <Text style={[styles.credLabel, { color: colors.textMuted }]}>USERNAME</Text>
                <Text style={[styles.credValue, { color: colors.text }]}>@{newCreds?.username}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.credRow}>
                <Text style={[styles.credLabel, { color: colors.textMuted }]}>NEW PIN</Text>
                <Text style={[styles.credValue, { color: colors.text, fontFamily: 'monospace', fontSize: 20, letterSpacing: 2 }]}>
                  {newCreds?.password}
                </Text>
              </View>
            </View>
            <Pressable onPress={() => setNewCreds(null)} style={[styles.doneBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Chip({
  label,
  active,
  colors,
  onPress,
  outline,
}: {
  label: string;
  active: boolean;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onPress: () => void;
  outline?: boolean;
}) {
  const bg = active ? colors.primary : outline ? 'transparent' : colors.surfaceAlt;
  const border = active || outline ? colors.primary : colors.border;
  const text = active ? '#fff' : outline ? colors.primary : colors.textMuted;
  return (
    <Pressable onPress={onPress} style={[chipStyles.chip, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[chipStyles.text, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  text: { fontSize: 12, fontWeight: '600' },
});

function FieldRow({ label, colors, children }: { label: string; colors: ReturnType<typeof useThemeStore.getState>['colors']; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    actions: {
      flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      paddingHorizontal: 8, paddingTop: 4,
    },
    saveBtn: { paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { fontSize: 15, fontWeight: '600' },

    scroll: { padding: 16, paddingBottom: 64 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
    },
    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, marginBottom: 20, overflow: 'hidden' },
    input: { fontSize: 15 },
    readOnly: { fontSize: 15, fontFamily: 'monospace' },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },

    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    toggleInfo: { flex: 1 },
    toggleTitle: { fontSize: 15, fontWeight: '600' },
    toggleSub: { fontSize: 12, marginTop: 2 },

    noClasses: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, marginBottom: 12 },
    noClassesText: { fontSize: 14, textAlign: 'center' },

    classCard: { borderWidth: 1.5, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
    classRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    classInfo: { flex: 1 },
    className: { fontSize: 15, fontWeight: '600' },
    classSub: { fontSize: 12, marginTop: 2 },
    permPicker: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
    permLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
    permBtns: { flexDirection: 'row', gap: 8 },
    permBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
    permBtnText: { fontSize: 12, fontWeight: '600' },
    permChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },

    resetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    resetIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    resetTitle: { fontSize: 15, fontWeight: '600' },
    resetSub: { fontSize: 12, marginTop: 2 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalBox: { width: '100%', maxWidth: 380, borderRadius: 20, padding: 24, alignItems: 'center' },
    modalIconBox: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    modalTitle: { fontSize: 19, fontWeight: '700' },
    modalSub: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
    credBox: { width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginTop: 18, overflow: 'hidden' },
    credRow: { paddingHorizontal: 14, paddingVertical: 12 },
    credLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    credValue: { fontSize: 15, fontWeight: '600', marginTop: 3 },
    doneBtn: { width: '100%', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
    doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
