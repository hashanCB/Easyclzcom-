import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions } from '../../../lib/students/hooks';
import { useNotesList } from '../../../lib/notes/hooks';
import { ClassPicker } from '../../../components/ClassPicker';
import { useScreenTitle } from '../../../lib/ui/header';
import type { Note } from '../../../db/schema/notes';

const NOTE_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  normal: 'document-text-outline',
  topic: 'layers-outline',
  today: 'today-outline',
  link: 'link-outline',
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  normal: 'Note',
  topic: 'Topic',
  today: "Today's",
  link: 'Link',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NotesListScreen() {
  useScreenTitle('Notes');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? 'local';

  const [classId, setClassId] = useState<string | undefined>(undefined);

  const classOptions = useClassOptions(teacherId);
  const filter = useMemo(() => ({ teacherId, classId }), [teacherId, classId]);
  const { notes, loading, refresh, isWeb } = useNotesList(filter);

  useFocusEffect(
    React.useCallback(() => { refresh(); }, [refresh]),
  );

  const styles = useMemo(() => buildStyles(colors), [colors]);

  if (isWeb) {
    return (
      <View style={styles.container}>
        <View style={styles.webNotice}>
          <Ionicons name="phone-portrait-outline" size={32} color={colors.textMuted} />
          <Text style={styles.webNoticeText}>Notes are available on the mobile app only.</Text>
        </View>
      </View>
    );
  }

  const renderNote = ({ item }: { item: Note }) => {
    const icon = NOTE_TYPE_ICONS[item.noteType] ?? 'document-text-outline';
    const typeLabel = NOTE_TYPE_LABELS[item.noteType] ?? item.noteType;
    return (
      <Pressable
        style={({ pressed }) => [styles.noteCard, pressed && { opacity: 0.85 }]}
        onPress={() => router.push(`/(app)/notes/${item.id}`)}
      >
        <View style={styles.noteIconBox}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.noteContent}>
          <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.noteMetaRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{typeLabel}</Text>
            </View>
            {item.topic ? <Text style={styles.noteMeta} numberOfLines={1}>{item.topic}</Text> : null}
          </View>
          <Text style={styles.noteDate}>{formatDate(item.noteDate)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/(app)/notes/new')}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={18} color={colors.primaryText} />
          <Text style={styles.addBtnText}>New</Text>
        </Pressable>
      </View>

      {/* Class filter */}
      {classOptions.length > 0 && (
        <View style={styles.filterWrap}>
          <ClassPicker
            classes={classOptions}
            value={classId}
            onChange={setClassId}
            colors={colors}
          />
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : notes.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptyText}>Tap New to add your first note.</Text>
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(n) => n.id}
          renderItem={renderNote}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
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
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
    },
    addBtnText: { fontSize: 14, fontWeight: '600', color: colors.primaryText },
    filterWrap: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    listContent: { padding: 16, gap: 10 },
    noteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    noteIconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noteContent: { flex: 1, gap: 3 },
    noteTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    noteMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    typeBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeBadgeText: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    noteMeta: { fontSize: 12, color: colors.textMuted, flex: 1 },
    noteDate: { fontSize: 11, color: colors.textMuted },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    emptyText: { fontSize: 14, color: colors.textMuted },
    webNotice: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    webNoticeText: { fontSize: 15, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
  });
}
