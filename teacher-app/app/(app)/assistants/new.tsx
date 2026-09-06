import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useClassesList } from '../../../lib/classes/hooks';
import { formatClassDays } from '../../../lib/classes/formatDays';
import { createAssistant } from '../../../lib/api/assistants';
import { useScreenTitle } from '../../../lib/ui/header';

type Permission = 'attendance' | 'payment' | 'both';

interface ClassPerm {
  class_id: string;
  permission: Permission | null;
  can_add_student: boolean;
}

// Combine the two independent attendance/payment toggles into the single stored
// enum (null = neither). "both" = attendance + payment.
function combine(attendance: boolean, payment: boolean): Permission | null {
  if (attendance && payment) return 'both';
  if (attendance) return 'attendance';
  if (payment) return 'payment';
  return null;
}

export default function NewAssistantScreen() {
  useScreenTitle('New Assistant');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const { classes } = useClassesList();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [classPerms, setClassPerms] = useState<ClassPerm[]>([]);
  const [saving, setSaving] = useState(false);

  // Credentials modal shown after creation
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string } | null>(null);

  const activeClasses = classes.filter((c) => c.isActive);

  function toggleClass(classId: string) {
    setClassPerms((prev) => {
      const exists = prev.find((p) => p.class_id === classId);
      if (exists) return prev.filter((p) => p.class_id !== classId);
      return [...prev, { class_id: classId, permission: 'both', can_add_student: false }];
    });
  }

  // Toggle Attendance or Payment on/off independently (you can have either, both,
  // or neither — neither means add-students-only if that chip is on).
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
      const result = await createAssistant(name.trim(), phone.trim(), classPerms, token);
      setCreatedCreds({ username: result.username, password: result.password });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create assistant');
    } finally {
      setSaving(false);
    }
  }

  const styles = buildStyles(colors);

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
          <FieldRow label="Full Name" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="e.g. Kasun Perera"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </FieldRow>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <FieldRow label="Phone" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="+94 77 123 4567"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </FieldRow>
        </View>

        {/* Class permissions */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>CLASS PERMISSIONS</Text>
        <Text style={[styles.permNote, { color: colors.textMuted }]}>
          Select which classes this assistant can access and what they can do.
        </Text>

        {activeClasses.length === 0 ? (
          <View style={[styles.noClasses, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text style={[styles.noClassesText, { color: colors.textMuted }]}>No active classes yet. Add classes first.</Text>
          </View>
        ) : (
          activeClasses.map((cls) => {
            const perm = classPerms.find((p) => p.class_id === cls.id);
            const selected = !!perm;
            return (
              <View key={cls.id} style={[styles.classCard, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border }]}>
                <Pressable
                  onPress={() => toggleClass(cls.id)}
                  style={styles.classRow}
                >
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

      {/* Credentials modal */}
      <Modal visible={!!createdCreds} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalIconBox, { backgroundColor: '#d1fae5' }]}>
              <Ionicons name="checkmark-circle" size={36} color="#059669" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Assistant Created!</Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>
              Share these login credentials with the assistant. The password cannot be shown again.
            </Text>

            <View style={[styles.credBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <CredRow label="Username" value={createdCreds?.username ?? ''} colors={colors} />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <CredRow label="Password" value={createdCreds?.password ?? ''} colors={colors} mono />
            </View>

            <Pressable
              onPress={() => { setCreatedCreds(null); router.back(); }}
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            >
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
  // "All" (outline) chip stays primary-bordered when inactive so it stands out
  // as a shortcut; the action chips fade to the neutral surface when off.
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

function FieldRow({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function CredRow({
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
    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, fontFamily: mono ? 'monospace' : undefined, letterSpacing: mono ? 2 : 0 }}>
        {value}
      </Text>
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    actions: {
      flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      paddingHorizontal: 8, paddingTop: 4,
    },
    saveBtn: { paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { fontSize: 15, fontWeight: '600' },

    scroll: { padding: 16, paddingBottom: 64 },

    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 4,
    },

    card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, marginBottom: 20, overflow: 'hidden' },
    input: { fontSize: 15 },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },

    permNote: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
    noClasses: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, marginBottom: 12 },
    noClassesText: { fontSize: 14, textAlign: 'center' },

    classCard: { borderWidth: 1.5, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
    classRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
      alignItems: 'center', justifyContent: 'center',
    },
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

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalBox: { width: '100%', borderRadius: 20, padding: 24, alignItems: 'center' },
    modalIconBox: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
    modalSub: { fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
    credBox: { width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
    doneBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
