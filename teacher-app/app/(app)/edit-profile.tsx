/**
 * Edit Profile — lets the teacher update their name, phone, email, address, gender.
 * Data is read from / written to Supabase via the REST API (teacher has a valid
 * Supabase session token, and the `teachers` table has RLS auth.uid() = id).
 * Photo upload goes to R2 via PhotoPickerButton.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../lib/theme/store';
import { useScreenTitle } from '../../lib/ui/header';
import { useAuthStore } from '../../lib/auth/store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';
import { PhotoPickerButton } from '../../components/PhotoPickerButton';
import { R2Paths } from '../../lib/r2/paths';

interface TeacherProfile {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gender: string | null;
  profile_photo_url: string | null;
  education_qualification: string | null;
}

const GENDERS = ['male', 'female', 'other'] as const;

// education_qualification is stored as a JSON array of lines. Older rows may
// hold a plain string — treat that as a single entry.
function parseQualifications(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((q) => String(q)).filter((q) => q.trim());
  } catch { /* not JSON */ }
  return raw.trim() ? [raw.trim()] : [];
}

export default function EditProfileScreen() {
  useScreenTitle('Edit Profile');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);

  const [fetching, setFetching] = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [address, setAddress] = useState('');
  const [gender,  setGender]  = useState('');
  const [photoKey, setPhotoKey] = useState('');
  const [qualifications, setQualifications] = useState<string[]>([]);

  const styles = buildStyles(colors);

  // Fetch full profile on mount
  useEffect(() => {
    if (!teacher?.id || !session?.access_token) { setFetching(false); return; }

    fetch(
      `${SUPABASE_URL}/rest/v1/teachers?id=eq.${teacher.id}&select=name,phone,email,address,gender,profile_photo_url,education_qualification`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          Accept: 'application/json',
        },
      },
    )
      .then((r) => r.json())
      .then((rows: TeacherProfile[]) => {
        const p = rows[0];
        if (p) {
          setName(p.name ?? '');
          setPhone(p.phone ?? '');
          setEmail(p.email ?? '');
          setAddress(p.address ?? '');
          setGender(p.gender ?? '');
          setPhotoKey(p.profile_photo_url ?? '');
          setQualifications(parseQualifications(p.education_qualification ?? null));
        }
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setFetching(false));
  }, [teacher?.id, session?.access_token]);

  async function save() {
    if (!teacher?.id || !session?.access_token) return;
    setError(null);
    setSaving(true);

    try {
      const cleanQuals = qualifications.map((q) => q.trim()).filter(Boolean);
      const body: Record<string, string | null> = {
        name:              name.trim()    || null,
        phone:             phone.trim()   || null,
        email:             email.trim()   || null,
        address:           address.trim() || null,
        gender:            gender         || null,
        profile_photo_url: photoKey       || null,
        education_qualification: cleanQuals.length > 0 ? JSON.stringify(cleanQuals) : null,
        is_profile_complete: 'true',
      };

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/teachers?id=eq.${teacher.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => res.status.toString());
        throw new Error(txt);
      }

      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      // iOS keyboard handling is done by the ScrollView's
      // automaticallyAdjustKeyboardInsets; Android uses adjustResize. Avoid
      // double-padding by keeping this wrapper inert.
      behavior={undefined}
    >

      {fetching ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >

          {/* Photo */}
          <View style={styles.photoRow}>
            <PhotoPickerButton
              r2Key={photoKey}
              onUploaded={setPhotoKey}
              accessToken={session?.access_token ?? ''}
              r2KeyBuilder={() => R2Paths.teacherPhoto(teacher?.id ?? 'unknown')}
              label="Change profile photo"
              size={96}
            />
          </View>

          {/* Fields */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PERSONAL DETAILS</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <FieldRow label="Full Name" value={name} onChangeText={setName} placeholder="Your full name" colors={colors} />
            <Div colors={colors} />
            <FieldRow label="Phone" value={phone} onChangeText={setPhone} placeholder="+94 77 000 0000" keyboardType="phone-pad" colors={colors} />
            <Div colors={colors} />
            <FieldRow label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" colors={colors} />
            <Div colors={colors} />
            <FieldRow label="Address" value={address} onChangeText={setAddress} placeholder="Optional" multiline colors={colors} />
          </View>

          {/* Education qualifications */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>EDUCATION QUALIFICATIONS</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {qualifications.length === 0 ? (
              <Text style={[styles.qualEmpty, { color: colors.textMuted }]}>
                Add your degrees, diplomas or certificates. Students see these when they join your class.
              </Text>
            ) : (
              qualifications.map((q, i) => (
                <View key={i}>
                  {i > 0 && <Div colors={colors} />}
                  <View style={styles.qualRow}>
                    <Ionicons name="school-outline" size={18} color={colors.textMuted} />
                    <TextInput
                      style={[styles.qualInput, { color: colors.text }]}
                      value={q}
                      onChangeText={(v) => setQualifications((prev) => prev.map((x, idx) => (idx === i ? v : x)))}
                      placeholder="e.g. BSc in IT — University of Colombo"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="sentences"
                    />
                    <Pressable
                      onPress={() => setQualifications((prev) => prev.filter((_, idx) => idx !== i))}
                      hitSlop={8}
                      accessibilityLabel="Remove qualification"
                    >
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            <Div colors={colors} />
            <Pressable
              onPress={() => setQualifications((prev) => [...prev, ''])}
              style={({ pressed }) => [styles.addQualRow, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.addQualText, { color: colors.primary }]}>Add qualification</Text>
            </Pressable>
          </View>

          {/* Gender picker */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>GENDER</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGender(g === gender ? '' : g)}
                  style={({ pressed }) => [
                    styles.genderChip,
                    {
                      borderColor: gender === g ? colors.primary : colors.border,
                      backgroundColor: gender === g ? colors.primary + '15' : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.genderLabel, { color: gender === g ? colors.primary : colors.text }]}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Error */}
          {error && (
            <View style={[styles.errorBox, { borderColor: colors.danger + '40', backgroundColor: colors.danger + '12' }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          )}

          {/* Save button */}
          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary, opacity: saving || pressed ? 0.75 : 1 }]}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Save Profile</Text>
            }
          </Pressable>

        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Div({ colors }: { colors: ReturnType<typeof useThemeStore.getState>['colors'] }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, marginLeft: 14, backgroundColor: colors.border }]} />;
}

function FieldRow({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize, multiline, colors,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
  multiline?: boolean;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  return (
    <View style={[fieldStyles.row, multiline && { alignItems: 'flex-start', paddingTop: 12 }]}>
      <Text style={[fieldStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, { color: colors.text }, multiline && { height: 72, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        multiline={multiline}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 52,
    gap: 10,
  },
  label: { width: 80, fontSize: 13, fontWeight: '600' },
  input: { flex: 1, fontSize: 14 },
});

// ── Page styles ────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    header: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    headerRight: { width: 44 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 16, paddingBottom: 120 },
    photoRow: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
      marginBottom: 8, marginTop: 4, textTransform: 'uppercase',
    },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      marginBottom: 20,
      overflow: 'hidden',
    },
    genderRow: {
      flexDirection: 'row',
      gap: 10,
      padding: 14,
    },
    genderChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
    },
    genderLabel: { fontSize: 13, fontWeight: '600' },
    qualEmpty: { fontSize: 13, lineHeight: 19, padding: 14 },
    qualRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 52,
    },
    qualInput: { flex: 1, fontSize: 14 },
    addQualRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    addQualText: { fontSize: 14, fontWeight: '700' },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    errorText: { flex: 1, fontSize: 13 },
    saveBtn: {
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
