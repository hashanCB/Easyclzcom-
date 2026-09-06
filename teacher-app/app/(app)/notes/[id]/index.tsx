import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../../lib/theme/store';
import { useAuthStore } from '../../../../lib/auth/store';
import { useNote, deleteNote, deleteNoteFile } from '../../../../lib/notes/hooks';
import { getDownloadUrl, deleteR2File } from '../../../../lib/r2';
import { useScreenTitle } from '../../../../lib/ui/header';
import type { NoteFile } from '../../../../db/schema/notes';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('default', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MIME_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'application/pdf': 'document-outline',
  'image/jpeg': 'image-outline',
  'image/png': 'image-outline',
  'image/webp': 'image-outline',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document-text-outline',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'easel-outline',
};

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useScreenTitle('Note Detail');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const session = useAuthStore((s) => s.session);

  const { note, files, loading, refresh } = useNote(id);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const styles = useMemo(() => buildStyles(colors), [colors]);

  async function handleDownload(file: NoteFile) {
    if (!session?.access_token) {
      Alert.alert('Not signed in', 'Please log in to download files.');
      return;
    }
    setDownloadingId(file.id);
    try {
      const url = await getDownloadUrl(file.r2Key, session.access_token);
      await Linking.openURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Download Failed', msg);
    } finally {
      setDownloadingId(null);
    }
  }

  function handleOpenLink() {
    if (!note?.linkUrl) return;
    Linking.openURL(note.linkUrl).catch(() =>
      Alert.alert('Cannot Open', 'Could not open the link.'),
    );
  }

  function confirmDeleteNote() {
    Alert.alert('Delete Note', 'Delete this note and all its files?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!note) return;
          const now = new Date().toISOString();
          if (session?.access_token) {
            for (const f of files) {
              try { await deleteR2File(f.r2Key, session.access_token); } catch {}
              deleteNoteFile(f.id, now);
            }
          }
          deleteNote(note.id, now);
          router.back();
        },
      },
    ]);
  }

  function confirmDeleteFile(file: NoteFile) {
    Alert.alert('Remove File', `Remove "${file.filename}" from this note?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const now = new Date().toISOString();
          if (session?.access_token) {
            try { await deleteR2File(file.r2Key, session.access_token); } catch {}
          }
          deleteNoteFile(file.id, now);
          refresh();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!note) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyText}>Note not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.backLinkBtn}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Actions */}
      <View style={styles.actions}>
        <Pressable onPress={confirmDeleteNote} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Title card */}
        <View style={styles.titleCard}>
          <View style={styles.titleRow}>
            <Text style={styles.noteTitle}>{note.title}</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{note.noteType.toUpperCase()}</Text>
            </View>
          </View>
          {note.topic ? <Text style={styles.noteTopic}>{note.topic}</Text> : null}
          <Text style={styles.noteDate}>{formatDate(note.noteDate)}</Text>
        </View>

        {/* Link */}
        {note.noteType === 'link' && note.linkUrl ? (
          <Pressable
            onPress={handleOpenLink}
            style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.linkIconBox}>
              <Ionicons name="link-outline" size={20} color={colors.primary} />
            </View>
            <Text style={styles.linkText} numberOfLines={2}>{note.linkUrl}</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </Pressable>
        ) : null}

        {/* Remark */}
        {note.remark ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>REMARK</Text>
            <Text style={styles.remarkText}>{note.remark}</Text>
          </View>
        ) : null}

        {/* Files */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ATTACHMENTS</Text>
          {files.length === 0 ? (
            <View style={styles.noFiles}>
              <Ionicons name="attach-outline" size={24} color={colors.textMuted} />
              <Text style={styles.noFilesText}>No files attached</Text>
            </View>
          ) : (
            files.map((f) => {
              const icon = MIME_ICONS[f.mimeType] ?? 'document-outline';
              const isDownloading = downloadingId === f.id;
              return (
                <View key={f.id} style={styles.fileCard}>
                  <View style={styles.fileIconBox}>
                    <Ionicons name={icon} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>{f.filename}</Text>
                    {f.sizeBytes ? <Text style={styles.fileSize}>{formatSize(f.sizeBytes)}</Text> : null}
                  </View>
                  <Pressable
                    onPress={() => handleDownload(f)}
                    disabled={isDownloading}
                    style={({ pressed }) => [styles.dlBtn, (pressed || isDownloading) && { opacity: 0.7 }]}
                  >
                    {isDownloading
                      ? <ActivityIndicator size="small" color={colors.primaryText} />
                      : <Ionicons name="cloud-download-outline" size={16} color={colors.primaryText} />}
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteFile(f)}
                    style={styles.fileDeleteBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    centered: { alignItems: 'center', justifyContent: 'center', gap: 12 },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    deleteBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    content: { padding: 16, gap: 14 },
    titleCard: {
      backgroundColor: colors.surface,
      borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: colors.border, gap: 6,
    },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    noteTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
    typeBadge: {
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
      backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    },
    typeBadgeText: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
    noteTopic: { fontSize: 14, color: colors.textMuted },
    noteDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    linkCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: colors.border,
    },
    linkIconBox: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    },
    linkText: { flex: 1, fontSize: 13, color: colors.primary },
    section: { gap: 8 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: colors.textMuted,
      letterSpacing: 0.6, textTransform: 'uppercase',
    },
    remarkText: {
      fontSize: 14, color: colors.text, lineHeight: 20,
      backgroundColor: colors.surface, borderRadius: 10, padding: 14,
      borderWidth: 1, borderColor: colors.border,
    },
    noFiles: {
      alignItems: 'center', gap: 8, padding: 24,
      backgroundColor: colors.surface, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    noFilesText: { fontSize: 13, color: colors.textMuted },
    fileCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface, borderRadius: 12, padding: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    fileIconBox: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    },
    fileInfo: { flex: 1, gap: 2 },
    fileName: { fontSize: 14, fontWeight: '500', color: colors.text },
    fileSize: { fontSize: 11, color: colors.textMuted },
    dlBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    },
    fileDeleteBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    },
    emptyText: { fontSize: 15, color: colors.textMuted },
    backLinkBtn: { marginTop: 4 },
    backLinkText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  });
}
