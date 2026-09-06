import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore } from '../../lib/theme/store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';

/**
 * ReceiptToggle — per-teacher switch for the auto payment-receipt SMS
 * (teachers.send_payment_receipt). Lives on the Payments screen because it
 * governs receipts for every collected payment (teacher OR assistant). Off by
 * default; each receipt costs money.
 */
export function ReceiptToggle() {
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);

  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!teacher?.id || !session?.access_token) { setLoading(false); return; }
    fetch(
      `${SUPABASE_URL}/rest/v1/teachers?id=eq.${teacher.id}&select=send_payment_receipt`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          Accept: 'application/json',
        },
      },
    )
      .then((r) => r.json())
      .then((rows: { send_payment_receipt?: boolean }[]) => {
        setOn(rows?.[0]?.send_payment_receipt === true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teacher?.id, session?.access_token]);

  async function toggle(next: boolean) {
    if (!teacher?.id || !session?.access_token || saving) return;
    setSaving(true);
    setOn(next); // optimistic
    try {
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
          body: JSON.stringify({ send_payment_receipt: next }),
        },
      );
      if (!res.ok) throw new Error(await res.text().catch(() => 'Failed'));
    } catch {
      setOn(!next); // revert on failure
      Alert.alert('Could not save', 'Failed to update receipt setting. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.iconBox, { backgroundColor: colors.primary + '18' }]}>
        <Ionicons name="receipt-outline" size={16} color={colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.text }]}>Payment Receipt SMS</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Auto-SMS a receipt to the student for every payment (teacher or assistant). Each receipt costs money.
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.textMuted} />
      ) : (
        <Switch
          value={on}
          onValueChange={toggle}
          disabled={saving}
          trackColor={{ true: colors.primary }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 11, marginTop: 2, lineHeight: 15 },
});
