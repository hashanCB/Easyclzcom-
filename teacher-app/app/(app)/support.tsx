import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/auth/store';
import { useThemeStore } from '../../lib/theme/store';
import { useScreenTitle } from '../../lib/ui/header';
import { fetchSupportPhone, toIntlPhone, DEFAULT_SUPPORT_PHONE } from '../../lib/support';
import { logEvent } from '../../lib/analytics';

export default function SupportScreen() {
  useScreenTitle('Help & Support');
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const [phone, setPhone] = useState(DEFAULT_SUPPORT_PHONE);

  useEffect(() => {
    logEvent('support_screen_view');
    if (!session?.access_token) return;
    let cancelled = false;
    void (async () => {
      const p = await fetchSupportPhone(session.access_token);
      if (!cancelled) setPhone(p);
    })();
    return () => { cancelled = true; };
  }, [session?.access_token]);

  const intl = toIntlPhone(phone);

  // A short, pre-filled message so we know who's contacting and from where.
  const greeting = `Hi, I need help with the Easyclz teacher app.\nUsername: ${teacher?.username ?? '-'}\nTeacher ID: ${teacher?.id ?? '-'}\n\n`;

  const openWhatsApp = async () => {
    logEvent('support_contact', { channel: 'whatsapp' });
    const num = intl.replace(/^\+/, '');
    const url = `whatsapp://send?phone=${num}&text=${encodeURIComponent(greeting)}`;
    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
    } else {
      // Fall back to wa.me which opens the browser/installed app.
      await Linking.openURL(`https://wa.me/${num}?text=${encodeURIComponent(greeting)}`);
    }
  };

  const callPhone = () => {
    logEvent('support_contact', { channel: 'call' });
    void Linking.openURL(`tel:${intl}`);
  };

  const sendSms = () => {
    logEvent('support_contact', { channel: 'sms' });
    void Linking.openURL(`sms:${intl}`);
  };

  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.introIconBox, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="headset-outline" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.introTitle, { color: colors.text }]}>We're here to help</Text>
          <Text style={[styles.introDesc, { color: colors.textMuted }]}>
            Have a question or problem? Reach us any way you like. We usually reply within a day.
          </Text>
        </View>

        {/* Contact options */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>CONTACT US</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ContactRow
            icon="logo-whatsapp"
            iconColor="#25D366"
            title="WhatsApp"
            subtitle={phone}
            colors={colors}
            onPress={openWhatsApp}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <ContactRow
            icon="call-outline"
            iconColor={colors.primary}
            title="Call us"
            subtitle={phone}
            colors={colors}
            onPress={callPhone}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <ContactRow
            icon="chatbox-ellipses-outline"
            iconColor={colors.primary}
            title="Send SMS"
            subtitle={phone}
            colors={colors}
            onPress={sendSms}
          />
        </View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Tip: include a short description and a screenshot if something looks wrong.
        </Text>
      </ScrollView>
    </View>
  );
}

function ContactRow({
  icon,
  iconColor,
  title,
  subtitle,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <View style={[styles.rowIconBox, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.menuRowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },

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

    scroll: { padding: 16, paddingBottom: 64 },

    introCard: {
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 20,
      marginBottom: 24,
    },
    introIconBox: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    introTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    introDesc: { fontSize: 13, lineHeight: 18, textAlign: 'center' },

    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
      textTransform: 'uppercase',
    },

    menuCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      marginBottom: 16,
      overflow: 'hidden',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 56,
    },
    menuRowTitle: { fontSize: 15, fontWeight: '600' },
    rowIconBox: {
      width: 34,
      height: 34,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowContent: { flex: 1 },
    rowSub: { fontSize: 12, marginTop: 2 },
    menuDivider: { height: StyleSheet.hairlineWidth },

    hint: { fontSize: 12, lineHeight: 17, marginTop: 4, paddingHorizontal: 4 },
  });
}

const styles = buildStyles({
  bg: '#fff', surface: '#fff', surfaceAlt: '#f3f4f6', border: '#e5e7eb',
  text: '#111827', textMuted: '#6b7280', primary: '#2563eb', primaryText: '#fff',
  danger: '#dc2626', overlay: 'rgba(0,0,0,0.5)',
} as ReturnType<typeof useThemeStore.getState>['colors']);
