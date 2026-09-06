import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { fetchAssistants, type Assistant } from '../../../lib/api/assistants';
import { useScreenTitle } from '../../../lib/ui/header';

export default function AssistantsScreen() {
  useScreenTitle('Assistants');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const token = useAuthStore((s) => s.session?.access_token ?? '');

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAssistants(token);
      setAssistants(data.filter((a) => !a.is_active || true)); // show all (active + inactive)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load assistants');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const styles = buildStyles(colors);
  const canAdd = assistants.filter((a) => !a.is_active).length < 2 && assistants.length < 2;

  return (
    <View style={styles.container}>
      {/* Actions */}
      {assistants.length < 2 && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/(app)/assistants/new')}
            hitSlop={8}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add" size={26} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Cap info */}
          <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {assistants.length}/2 assistants created. Pro subscription required.
            </Text>
          </View>

          {assistants.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: '#f59e0b18' }]}>
                <Ionicons name="person-add-outline" size={32} color="#f59e0b" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Assistants Yet</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Add up to 2 assistants who can mark attendance or collect payments on your behalf.
              </Text>
              <Pressable
                onPress={() => router.push('/(app)/assistants/new')}
                style={({ pressed }) => [styles.addFirstBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addFirstBtnText}>Add Assistant</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR ASSISTANTS</Text>
              {assistants.map((a) => (
                <AssistantCard
                  key={a.id}
                  assistant={a}
                  colors={colors}
                  onPress={() => router.push(`/(app)/assistants/${a.id}` as never)}
                  onActivity={() => router.push(`/(app)/assistants/activity?id=${a.id}&name=${encodeURIComponent(a.name)}` as never)}
                />
              ))}
              {assistants.length < 2 && (
                <Pressable
                  onPress={() => router.push('/(app)/assistants/new')}
                  style={({ pressed }) => [styles.addMoreBtn, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                  <Text style={[styles.addMoreText, { color: colors.primary }]}>Add Another Assistant</Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function AssistantCard({
  assistant,
  colors,
  onPress,
  onActivity,
}: {
  assistant: Assistant;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onPress: () => void;
  onActivity: () => void;
}) {
  const initials = assistant.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const styles = buildStyles(colors);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.avatar, { backgroundColor: assistant.is_active ? '#f59e0b18' : colors.surfaceAlt }]}>
        <Text style={[styles.avatarText, { color: assistant.is_active ? '#f59e0b' : colors.textMuted }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardName, { color: colors.text }]}>{assistant.name}</Text>
          <View style={[styles.badge, { backgroundColor: assistant.is_active ? '#d1fae5' : '#fee2e2' }]}>
            <Text style={[styles.badgeText, { color: assistant.is_active ? '#059669' : '#dc2626' }]}>
              {assistant.is_active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
        <Text style={[styles.cardUsername, { color: colors.textMuted }]}>@{assistant.username}</Text>
        <Text style={[styles.cardPhone, { color: colors.textMuted }]}>{assistant.phone}</Text>
        <Pressable
          onPress={onActivity}
          hitSlop={6}
          style={({ pressed }) => [styles.activityBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="stats-chart-outline" size={14} color={colors.primary} />
          <Text style={[styles.activityBtnText, { color: colors.primary }]}>Activity & collections</Text>
        </Pressable>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    actions: {
      flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      paddingHorizontal: 8, paddingTop: 4,
    },
    addBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    activityBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
      marginTop: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    activityBtnText: { fontSize: 12, fontWeight: '700' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 16, paddingBottom: 64 },

    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 10,
      padding: 12,
      marginBottom: 20,
    },
    infoText: { flex: 1, fontSize: 13 },

    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 8,
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 17, fontWeight: '700' },
    cardContent: { flex: 1 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    cardName: { fontSize: 15, fontWeight: '700', flex: 1 },
    cardUsername: { fontSize: 12, marginBottom: 2 },
    cardPhone: { fontSize: 13 },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
    badgeText: { fontSize: 11, fontWeight: '700' },

    emptyState: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
    emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    addFirstBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
    },
    addFirstBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    addMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderRadius: 12,
      borderStyle: 'dashed',
      paddingVertical: 14,
      marginTop: 4,
    },
    addMoreText: { fontSize: 15, fontWeight: '600' },
  });
}
