import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { uiAlert } from '../../../lib/uiAlert';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ClassForm } from '../../../components/ClassForm';
import { saveClass } from '../../../lib/classes/hooks';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useScreenTitle } from '../../../lib/ui/header';

export default function NewClassScreen() {
  useScreenTitle('New Class');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const [saving, setSaving] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {Platform.OS === 'web' ? (
        <View style={[styles.banner, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.bannerText, { color: colors.textMuted }]}>
            Web preview is read-only — saving requires the iOS/Android app.
          </Text>
        </View>
      ) : null}

      <ClassForm
        teacherId={teacher?.id ?? 'local'}
        submitting={saving}
        onCancel={() => router.back()}
        onSubmit={(data) => {
          setSaving(true);
          try {
            saveClass(data);
            router.back();
          } catch (e: unknown) {
            setSaving(false);
            uiAlert('Could not save', (e as Error).message);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerRight: { width: 44 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 16 },
});
