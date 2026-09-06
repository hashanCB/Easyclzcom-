import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { uiAlert } from '../../../lib/uiAlert';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StudentForm } from '../../../components/StudentForm';
import {
  nextStudentCode,
  saveStudent,
  useClassOptions,
} from '../../../lib/students/hooks';
import { useAuthStore } from '../../../lib/auth/store';
import { logEvent } from '../../../lib/analytics';
import { useThemeStore } from '../../../lib/theme/store';
import { generateStudentPassword } from '../../../lib/students/password';
import { sendStudentWelcomeSms } from '../../../lib/messages/welcome';
import { useScreenTitle } from '../../../lib/ui/header';

export default function NewStudentScreen() {
  useScreenTitle('New Student');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const teacherId = teacher?.id ?? 'local';
  const [saving, setSaving] = useState(false);

  const classOptions = useClassOptions(teacherId);
  const generatedCode = useMemo(() => nextStudentCode(teacherId), [teacherId]);
  const generatedPassword = useMemo(() => {
    try {
      return generateStudentPassword();
    } catch {
      return String(Math.floor(100000 + Math.random() * 900000));
    }
  }, []);

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

      <StudentForm
        teacherId={teacherId}
        classOptions={classOptions}
        generatedCode={generatedCode}
        generatedPassword={generatedPassword}
        submitting={saving}
        onCancel={() => router.back()}
        onSubmit={async (data, opts) => {
          setSaving(true);
          try {
            saveStudent(data, undefined, opts?.enrollments);
            logEvent('student.add', {
              has_class: !!data.classId,
              class_count: opts?.enrollments?.length ?? 1,
            });
          } catch (e: unknown) {
            setSaving(false);
            uiAlert('Could not save', (e as Error).message);
            return;
          }
          // Student saved. Best-effort welcome SMS (portal link + login).
          if (opts?.sendWelcomeSms && data.studentPhone) {
            try {
              const cls = classOptions.find((c) => c.id === data.classId);
              await sendStudentWelcomeSms({
                token: session?.access_token ?? '',
                classId: data.classId,
                className: cls?.label ?? 'your class',
                teacherName: teacher?.username ?? '',
                studentId: data.id,
                studentName: data.name,
                studentCode: data.studentCode,
                password: data.passwordPlain ?? null,
                recipientPhone: data.studentPhone,
              });
            } catch (e: unknown) {
              uiAlert('Student saved, but SMS not sent', (e as Error).message);
            }
          }
          router.back();
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
    marginHorizontal: 12,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 16 },
});
