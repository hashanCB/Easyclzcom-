// Message template list — grouped by type, shows language badges + default marker.
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../../../lib/theme/store';
import { useScreenTitle } from '../../../../lib/ui/header';
import {
  useTemplatesList,
  TEMPLATE_TYPE_LABELS,
  TEMPLATE_TYPES,
  type TemplateType,
} from '../../../../lib/messages/templates';
import type { MessageTemplate } from '../../../../db/schema/messageTemplates';

const TYPE_ICONS: Record<TemplateType, string> = {
  payment_reminder: 'card-outline',
  payment_received: 'receipt-outline',
  attendance_absent: 'close-circle-outline',
  attendance_summary: 'clipboard-outline',
  class_cancel: 'ban-outline',
  exam_result: 'trophy-outline',
  note_uploaded: 'document-text-outline',
  custom: 'megaphone-outline',
};

const TYPE_COLORS: Record<TemplateType, { icon: string; bg: string }> = {
  payment_reminder: { icon: '#7c3aed', bg: '#f5f3ff' },
  payment_received: { icon: '#059669', bg: '#d1fae5' },
  attendance_absent: { icon: '#dc2626', bg: '#fee2e2' },
  attendance_summary: { icon: '#2563eb', bg: '#eff6ff' },
  class_cancel: { icon: '#d97706', bg: '#fef3c7' },
  exam_result: { icon: '#f59e0b', bg: '#fffbeb' },
  note_uploaded: { icon: '#059669', bg: '#d1fae5' },
  custom: { icon: '#6b7280', bg: '#f3f4f6' },
};

export default function TemplatesListScreen() {
  useScreenTitle('Message Templates');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { templates, loading, refresh } = useTemplatesList();

  const byType = useMemo(() => {
    const map: Partial<Record<TemplateType, MessageTemplate[]>> = {};
    for (const t of templates) {
      const key = t.type as TemplateType;
      if (!map[key]) map[key] = [];
      map[key]!.push(t);
    }
    return map;
  }, [templates]);

  const styles = buildStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/(app)/messages/templates/new')}
          hitSlop={8}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={26} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
        >
          <Text style={[styles.intro, { color: colors.textMuted }]}>
            Templates let you quickly send pre-written messages. Use {'{variable}'} placeholders — they are filled in automatically when sending.
          </Text>

          {TEMPLATE_TYPES.map((type) => {
            const rows = byType[type] ?? [];
            const tc = TYPE_COLORS[type];
            return (
              <View key={type} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.typeIconBox, { backgroundColor: tc.bg }]}>
                    <Ionicons name={TYPE_ICONS[type] as never} size={16} color={tc.icon} />
                  </View>
                  <Text style={[styles.sectionLabel, { color: colors.text }]}>
                    {TEMPLATE_TYPE_LABELS[type]}
                  </Text>
                  <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
                    {rows.length > 0 ? `${rows.length}` : ''}
                  </Text>
                </View>

                {rows.length === 0 ? (
                  <Text style={[styles.emptyRow, { color: colors.textMuted }]}>No templates yet</Text>
                ) : (
                  rows.map((tmpl) => (
                    <Pressable
                      key={tmpl.id}
                      onPress={() => router.push({ pathname: '/(app)/messages/templates/[id]', params: { id: tmpl.id } })}
                      style={({ pressed }) => [
                        styles.card,
                        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                      ]}
                    >
                      <View style={styles.cardTop}>
                        <View style={styles.cardMeta}>
                          <View style={[styles.langBadge, { backgroundColor: colors.surfaceAlt }]}>
                            <Text style={[styles.langText, { color: colors.textMuted }]}>
                              {tmpl.language.toUpperCase()}
                            </Text>
                          </View>
                          {tmpl.isDefault && (
                            <View style={[styles.defaultBadge, { backgroundColor: '#d1fae5' }]}>
                              <Ionicons name="star" size={10} color="#059669" />
                              <Text style={[styles.defaultText, { color: '#059669' }]}>Default</Text>
                            </View>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </View>
                      <Text style={[styles.preview, { color: colors.text }]} numberOfLines={2}>
                        {tmpl.body}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    actions: {
      flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      paddingHorizontal: 8, paddingTop: 4,
    },
    addBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    scroll: { padding: 16, paddingBottom: 48 },
    intro: { fontSize: 13, lineHeight: 19, marginBottom: 20 },

    section: { marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    typeIconBox: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    sectionLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
    sectionCount: { fontSize: 13 },

    emptyRow: { fontSize: 13, paddingLeft: 40, fontStyle: 'italic' },

    card: {
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 8,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    cardMeta: { flex: 1, flexDirection: 'row', gap: 6 },
    langBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    langText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    defaultText: { fontSize: 10, fontWeight: '700' },
    preview: { fontSize: 13, lineHeight: 18 },
  });
}
