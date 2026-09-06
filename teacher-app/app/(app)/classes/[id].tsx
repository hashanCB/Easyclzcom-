import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ClassForm, type ClassFormHandle } from '../../../components/ClassForm';
import {
  activateClass,
  deactivateClass,
  saveClass,
  useClass,
} from '../../../lib/classes/hooks';
import { useAuthStore } from '../../../lib/auth/store';
import { useThemeStore } from '../../../lib/theme/store';
import { useScreenTitle } from '../../../lib/ui/header';
import {
  fetchClassJoinCode,
  formatJoinCode,
  regenerateClassJoinCode,
} from '../../../lib/students/joinRequests';

export default function EditClassScreen() {
  useScreenTitle('Edit Class');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const { cls, loading } = useClass(id);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<ClassFormHandle>(null);
  // Permanent join code lives in the cloud (assigned when the class syncs).
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id || !session?.access_token) { setCodeLoading(false); return; }
      const code = await fetchClassJoinCode(id, session.access_token).catch(() => null);
      if (!cancelled) { setJoinCode(code); setCodeLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, session?.access_token]);

  function onRegenerate() {
    Alert.alert(
      'New class code?',
      'The current code stops working right away. Students who already joined are not affected — only share the new code from now on.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate new code',
          style: 'destructive',
          onPress: async () => {
            if (!id || !session?.access_token) return;
            setCodeLoading(true);
            try {
              const code = await regenerateClassJoinCode(id, session.access_token);
              setJoinCode(code);
            } catch (e: unknown) {
              Alert.alert('Failed', (e as Error).message);
            } finally {
              setCodeLoading(false);
            }
          },
        },
      ],
    );
  }

  async function shareCode() {
    if (!joinCode || !cls) return;
    const label = [cls.subject, cls.grade ? `Grade ${cls.grade}` : '', cls.batch]
      .filter(Boolean)
      .join(' · ');
    await Share.share({
      message:
        `Join ${label || 'my class'} on Easyclz!\n\n` +
        `Class code: ${formatJoinCode(joinCode)}\n\n` +
        `Open the student portal, create your account, tap "Join a Class" and enter this code. ` +
        `I will accept your request.`,
    });
  }

  function toggle() {
    if (!cls) return;
    try {
      if (cls.isActive) deactivateClass(cls.id);
      else activateClass(cls.id);
      router.back();
    } catch (e: unknown) {
      Alert.alert('Failed', (e as Error).message);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {cls && (
        <View style={styles.actions}>
          <Pressable
            onPress={toggle}
            hitSlop={8}
            style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.7 }]}
          >
            <Text
              style={[
                styles.headerActionText,
                { color: cls.isActive ? colors.danger : colors.primary },
              ]}
            >
              {cls.isActive ? 'Deactivate' : 'Activate'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => formRef.current?.submit()}
            disabled={saving}
            style={({ pressed }) => [
              styles.topSaveBtn,
              { backgroundColor: colors.primary },
              (pressed || saving) && { opacity: 0.85 },
            ]}
            accessibilityLabel="Save class changes"
          >
            <Ionicons name="checkmark" size={16} color={colors.primaryText} />
            <Text style={[styles.topSaveText, { color: colors.primaryText }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <Text style={[styles.info, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      ) : !cls ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.border} />
          <Text style={[styles.info, { color: colors.textMuted }]}>Class not found.</Text>
        </View>
      ) : (
        <>
        <View style={[styles.codeCard, { backgroundColor: '#7c3aed12', borderColor: '#7c3aed' }]}>
          <Ionicons name="key-outline" size={20} color="#7c3aed" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.codeLabel, { color: colors.textMuted }]}>Class code</Text>
            <Text style={[styles.codeValue, { color: colors.text }]}>
              {codeLoading
                ? 'Loading…'
                : joinCode
                ? formatJoinCode(joinCode)
                : 'Not synced yet — connect to internet'}
            </Text>
          </View>
          {joinCode ? (
            <>
              <Pressable
                onPress={onRegenerate}
                hitSlop={8}
                style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel="Generate a new class code"
              >
                <Ionicons name="refresh-outline" size={18} color="#7c3aed" />
              </Pressable>
              <Pressable
                onPress={shareCode}
                hitSlop={8}
                style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel="Share class code"
              >
                <Ionicons name="share-social-outline" size={18} color="#7c3aed" />
                <Text style={styles.shareText}>Share</Text>
              </Pressable>
            </>
          ) : null}
        </View>
        <ClassForm
          ref={formRef}
          initial={cls}
          teacherId={teacher?.id ?? cls.teacherId}
          submitting={saving}
          onCancel={() => router.back()}
          onSubmit={(data) => {
            setSaving(true);
            try {
              saveClass(data, cls.id);
              router.back();
            } catch (e: unknown) {
              setSaving(false);
              Alert.alert('Could not save', (e as Error).message);
            }
          }}
        />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  headerAction: {
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerActionText: { fontSize: 14, fontWeight: '600' },
  topSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 10,
  },
  topSaveText: { fontSize: 14, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  info: { fontSize: 14, marginTop: 4 },

  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  codeLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  codeValue: { fontSize: 18, fontWeight: '800', letterSpacing: 2, marginTop: 2 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#7c3aed20',
  },
  shareText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
});
