// View / edit / delete a template. Also lets the teacher toggle it as the default.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../../../lib/theme/store';
import { useAuthStore } from '../../../../../lib/auth/store';
import { useScreenTitle } from '../../../../../lib/ui/header';
import {
  useTemplate,
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_LABELS,
  TEMPLATE_LANGUAGES,
  TEMPLATE_VARIABLES,
  renderTemplate,
  updateTemplate,
  deleteTemplate,
  type TemplateType,
  type TemplateLanguage,
} from '../../../../../lib/messages/templates';

const PREVIEW_VARS: Record<string, string> = {
  student_name: 'Kasun Perera',
  parent_name: 'Nimal Perera',
  class_name: 'Grade 10 Science',
  grade: '10',
  batch: 'Batch A',
  subject: 'Science',
  language: 'English',
  month: '2026-05',
  amount: 'LKR 3,500',
  due_date: '2026-05-25',
  exam_name: 'Mid-Term Exam',
  marks: '87/100',
  rank: '3rd',
  teacher_name: 'Mr. Chanaka',
};

export default function TemplateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useScreenTitle('Edit Template');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? '');
  const { template, loading } = useTemplate(id);

  const [type, setType] = useState<TemplateType>('payment_reminder');
  const [language, setLanguage] = useState<TemplateLanguage>('english');
  const [body, setBody] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (template) {
      setType(template.type as TemplateType);
      setLanguage(template.language as TemplateLanguage);
      setBody(template.body);
      setIsDefault(template.isDefault);
    }
  }, [template]);

  function insertVariable(v: string) {
    setBody((prev) => prev + v);
  }

  async function handleSave() {
    if (!body.trim()) return Alert.alert('Validation', 'Template body cannot be empty.');
    setSaving(true);
    try {
      await updateTemplate(teacherId, id, { type, language, body: body.trim(), isDefault });
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save template. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Template',
      'Are you sure you want to delete this template? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTemplate(id);
            router.back();
          },
        },
      ],
    );
  }

  const preview = renderTemplate(body, PREVIEW_VARS);
  const styles = buildStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!template) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ color: colors.textMuted }}>Template not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.actions}>
        <Pressable onPress={handleSave} disabled={saving} hitSlop={8} style={styles.saveBtn}>
          <Text style={[styles.saveBtnText, { color: saving ? colors.textMuted : colors.primary }]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Type picker */}
          <Text style={[styles.label, { color: colors.textMuted }]}>TEMPLATE TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {TEMPLATE_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[styles.chip, { backgroundColor: t === type ? colors.primary : colors.surfaceAlt, borderColor: t === type ? colors.primary : colors.border }]}
              >
                <Text style={[styles.chipText, { color: t === type ? '#fff' : colors.text }]}>
                  {TEMPLATE_TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Language picker */}
          <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>LANGUAGE</Text>
          <View style={styles.langRow}>
            {TEMPLATE_LANGUAGES.map((l) => (
              <Pressable
                key={l}
                onPress={() => setLanguage(l)}
                style={[
                  styles.langBtn,
                  { backgroundColor: l === language ? colors.primary : colors.surfaceAlt, borderColor: l === language ? colors.primary : colors.border },
                ]}
              >
                <Text style={[styles.langBtnText, { color: l === language ? '#fff' : colors.text }]}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Body editor */}
          <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>MESSAGE BODY</Text>
          <TextInput
            style={[styles.bodyInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={6}
            placeholder="Type your message here…"
            placeholderTextColor={colors.textMuted}
            textAlignVertical="top"
          />

          {/* Variable chips */}
          <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>INSERT VARIABLE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {TEMPLATE_VARIABLES.map((v) => (
              <Pressable
                key={v}
                onPress={() => insertVariable(v)}
                style={[styles.varChip, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
              >
                <Text style={[styles.varChipText, { color: '#2563eb' }]}>{v}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Set as default */}
          <View style={[styles.switchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.switchInfo}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>Set as default</Text>
              <Text style={[styles.switchSub, { color: colors.textMuted }]}>
                Use this template by default for {TEMPLATE_TYPE_LABELS[type]} messages
              </Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Live preview */}
          <Pressable
            onPress={() => setShowPreview((v) => !v)}
            style={[styles.previewToggle, { borderColor: colors.border }]}
          >
            <Ionicons name={showPreview ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
            <Text style={[styles.previewToggleText, { color: colors.textMuted }]}>
              {showPreview ? 'Hide preview' : 'Preview with sample data'}
            </Text>
          </Pressable>

          {showPreview && (
            <View style={[styles.previewBox, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}>
              <Text style={[styles.previewLabel, { color: '#16a34a' }]}>PREVIEW</Text>
              <Text style={[styles.previewText, { color: '#166534' }]}>{preview}</Text>
            </View>
          )}

          {/* Delete */}
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.7 : 1, borderColor: colors.danger }]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete Template</Text>
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    actions: {
      flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      paddingHorizontal: 8, paddingTop: 4,
    },
    saveBtn: { paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { fontSize: 15, fontWeight: '700' },

    scroll: { padding: 16, paddingBottom: 48 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },

    chipScroll: { marginHorizontal: -16 },
    chipRow: { paddingHorizontal: 16, gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },

    langRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    langBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
    langBtnText: { fontSize: 13, fontWeight: '600' },

    bodyInput: {
      borderWidth: 1.5, borderRadius: 12, padding: 14,
      fontSize: 14, lineHeight: 20, minHeight: 140,
    },

    varChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    varChipText: { fontSize: 12, fontWeight: '600' },

    switchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, marginTop: 20,
    },
    switchInfo: { flex: 1 },
    switchLabel: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    switchSub: { fontSize: 12, lineHeight: 16 },

    previewToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 10, marginTop: 16,
    },
    previewToggleText: { fontSize: 13 },

    previewBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 },
    previewLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
    previewText: { fontSize: 14, lineHeight: 20 },

    deleteBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, marginTop: 24,
    },
    deleteBtnText: { fontSize: 14, fontWeight: '700' },
  });
}
