import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { saveNote, saveNoteFile } from '../../../lib/notes/hooks';
import { getUploadUrl, uploadBlobToR2, fetchFileBlob } from '../../../lib/r2';
import { newId } from '../../../lib/uuid';
import { useScreenTitle } from '../../../lib/ui/header';

type NoteType = 'normal' | 'topic' | 'today' | 'link';
const NOTE_TYPES: { value: NoteType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'normal', label: 'Normal', icon: 'document-text-outline' },
  { value: 'topic', label: 'Topic', icon: 'layers-outline' },
  { value: 'today', label: "Today's", icon: 'today-outline' },
  { value: 'link', label: 'Link', icon: 'link-outline' },
];

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowISO(): string {
  return new Date().toISOString();
}

export default function NewNoteScreen() {
  useScreenTitle('New Note');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const teacherId = teacher?.id ?? 'local';

  const classOptions = useClassOptions(teacherId);

  const [noteType, setNoteType] = useState<NoteType>('normal');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [classId, setClassId] = useState('');
  const [noteDate, setNoteDate] = useState(todayISO());
  const [linkUrl, setLinkUrl] = useState('');
  const [remark, setRemark] = useState('');
  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const styles = useMemo(() => buildStyles(colors), [colors]);

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const newFiles: PickedFile[] = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType ?? 'application/octet-stream',
        size: a.size,
      }));
      setPickedFiles((prev) => [...prev, ...newFiles]);
    } catch (e) {
      Alert.alert('Error', 'Could not pick file.');
    }
  }

  function removeFile(index: number) {
    setPickedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!classId) errs.classId = 'Please select a class';
    if (!noteDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.noteDate = 'Date must be YYYY-MM-DD';
    if (noteType === 'link' && !linkUrl.trim()) errs.linkUrl = 'Link URL is required for link notes';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const noteId = newId();
      const now = nowISO();

      saveNote({
        id: noteId,
        teacherId,
        classId,
        title: title.trim(),
        topic: topic.trim() || null,
        noteDate,
        noteType,
        linkUrl: noteType === 'link' ? linkUrl.trim() : null,
        remark: remark.trim() || null,
        createdAt: now,
        updatedAt: now,
        clientUpdatedAt: now,
      });

      // Upload each file to R2 then save the record
      if (pickedFiles.length > 0 && session?.access_token) {
        for (const f of pickedFiles) {
          const r2Key = `t/${teacherId}/notes/${noteId}/${f.name}`;
          const blob = await fetchFileBlob(f.uri);
          const size = blob.size;
          if (size <= 0) {
            throw new Error(`Could not read "${f.name}". Please pick the file again.`);
          }
          const uploadUrl = await getUploadUrl(r2Key, f.mimeType, size, session.access_token);
          await uploadBlobToR2(uploadUrl, blob, f.mimeType);
          saveNoteFile({
            id: newId(),
            noteId,
            teacherId,
            filename: f.name,
            mimeType: f.mimeType,
            sizeBytes: size,
            r2Key,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      router.back();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Save Failed', msg);
    } finally {
      setSaving(false);
    }
  }

  const selectedClass = classOptions.find((c) => c.id === classId);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.75 }]}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.primaryText} />
              : <Text style={styles.saveBtnText}>Save</Text>}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Note type selector */}
          <Text style={styles.sectionLabel}>NOTE TYPE</Text>
          <View style={styles.typeRow}>
            {NOTE_TYPES.map((t) => (
              <Pressable
                key={t.value}
                style={[styles.typeBtn, noteType === t.value && styles.typeBtnActive]}
                onPress={() => setNoteType(t.value)}
              >
                <Ionicons name={t.icon} size={16} color={noteType === t.value ? colors.primaryText : colors.textMuted} />
                <Text style={[styles.typeBtnText, noteType === t.value && styles.typeBtnTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Title */}
          <Text style={styles.label}>Title <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, errors.title ? styles.inputError : null]}
            placeholder="e.g. Chapter 5 – Quadratic Equations"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}

          {/* Topic */}
          <Text style={styles.label}>Topic</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Algebra"
            placeholderTextColor={colors.textMuted}
            value={topic}
            onChangeText={setTopic}
          />

          {/* Class */}
          <Text style={styles.label}>Class <Text style={styles.required}>*</Text></Text>
          {errors.classId ? <Text style={styles.errorText}>{errors.classId}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classScroll}>
            <View style={styles.classChipsRow}>
              {classOptions.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.chip, classId === c.id && styles.chipActive]}
                  onPress={() => setClassId(c.id)}
                >
                  <Text style={[styles.chipText, classId === c.id && styles.chipTextActive]} numberOfLines={1}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {selectedClass && (
            <View style={styles.selectedClassRow}>
              <Ionicons name="school-outline" size={14} color={colors.textMuted} />
              <Text style={styles.selectedClassText}>{selectedClass.label}</Text>
            </View>
          )}

          {/* Date */}
          <Text style={styles.label}>Date <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, errors.noteDate ? styles.inputError : null]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            value={noteDate}
            onChangeText={setNoteDate}
            maxLength={10}
          />
          {errors.noteDate ? <Text style={styles.errorText}>{errors.noteDate}</Text> : null}

          {/* Link URL (for link type) */}
          {noteType === 'link' && (
            <>
              <Text style={styles.label}>Link URL <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={[styles.input, errors.linkUrl ? styles.inputError : null]}
                placeholder="https://..."
                placeholderTextColor={colors.textMuted}
                value={linkUrl}
                onChangeText={setLinkUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              {errors.linkUrl ? <Text style={styles.errorText}>{errors.linkUrl}</Text> : null}
            </>
          )}

          {/* Remark */}
          <Text style={styles.label}>Remark</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Optional notes..."
            placeholderTextColor={colors.textMuted}
            value={remark}
            onChangeText={setRemark}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* File attachments */}
          <Text style={styles.sectionLabel}>ATTACHMENTS</Text>
          {pickedFiles.map((f, i) => (
            <View key={i} style={styles.fileRow}>
              <Ionicons name="attach-outline" size={16} color={colors.textMuted} />
              <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
              {f.size ? <Text style={styles.fileSize}>{(f.size / 1024).toFixed(0)} KB</Text> : null}
              <Pressable onPress={() => removeFile(i)} style={styles.removeFileBtn}>
                <Ionicons name="close-circle" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={pickFile} style={({ pressed }) => [styles.attachBtn, pressed && { opacity: 0.8 }]}>
            <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
            <Text style={styles.attachBtnText}>Attach File (PDF, Image, Word, PPT)</Text>
          </Pressable>
          <Text style={styles.attachHint}>Max 50 MB per file</Text>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    saveBtn: {
      backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 8,
      borderRadius: 20, minWidth: 64, alignItems: 'center',
    },
    saveBtnText: { fontSize: 14, fontWeight: '600', color: colors.primaryText },
    form: { padding: 16, gap: 4 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: colors.textMuted,
      letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 12, marginBottom: 6,
    },
    typeRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
    typeBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    },
    typeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeBtnText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    typeBtnTextActive: { color: colors.primaryText },
    label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
    required: { color: colors.danger },
    input: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
      fontSize: 15, color: colors.text,
    },
    inputError: { borderColor: colors.danger },
    textarea: { minHeight: 80, paddingTop: 10 },
    errorText: { fontSize: 12, color: colors.danger, marginTop: 3 },
    classScroll: { marginBottom: 6 },
    classChipsRow: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
    chip: {
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
      backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
    chipTextActive: { color: colors.primaryText },
    selectedClassRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.surfaceAlt, padding: 10, borderRadius: 8, marginTop: 4,
    },
    selectedClassText: { fontSize: 13, color: colors.textMuted },
    fileRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 10, padding: 10, marginBottom: 6,
    },
    fileName: { flex: 1, fontSize: 13, color: colors.text },
    fileSize: { fontSize: 11, color: colors.textMuted },
    removeFileBtn: { padding: 2 },
    attachBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed',
      borderRadius: 10, padding: 14, justifyContent: 'center', marginTop: 6,
    },
    attachBtnText: { fontSize: 14, fontWeight: '500', color: colors.primary },
    attachHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  });
}
