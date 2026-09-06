import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { bumpStudentCardVersion, useStudent } from '../../../../lib/students';
import { useThemeStore } from '../../../../lib/theme/store';
import { useScreenTitle } from '../../../../lib/ui/header';

// Lazy-require so the bundle doesn't crash on web where react-native-svg isn't fully wired.
function getQRComponent(): React.ComponentType<{
  value: string;
  size: number;
  backgroundColor: string;
  color: string;
  getRef?: (ref: unknown) => void;
}> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-qrcode-svg');
    return (mod.default ?? mod) as ReturnType<typeof getQRComponent>;
  } catch {
    return null;
  }
}

/** QR payload: v1.<studentId>.<cardVersion>.<expUnix> */
function buildQrPayload(studentId: string, cardVersion: number): string {
  const expUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  return `v1.${studentId}.${cardVersion}.${expUnix}`;
}

/** Build a compact A6-sized print-ready HTML ID card. Uses qrserver.com to embed QR as image. */
function buildCardHtml(opts: {
  name: string;
  studentCode: string;
  subject: string;
  grade: string;
  batch: string;
  language: string;
  cardVersion: number;
  qrPayload: string;
}): string {
  const { name, studentCode, subject, grade, batch, language, cardVersion, qrPayload } = opts;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=4&data=${encodeURIComponent(qrPayload)}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: flex-start; padding: 20px; }
  .card {
    width: 85.6mm; /* credit-card width */
    background: #fff;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12);
    page-break-inside: avoid;
  }
  .header {
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: #fff;
    padding: 10px 12px 8px;
  }
  .header-label { font-size: 7px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: 0.75; }
  .header-name { font-size: 15px; font-weight: 800; margin-top: 2px; letter-spacing: -0.3px; }
  .body { display: flex; flex-direction: row; align-items: center; padding: 10px 12px; gap: 10px; }
  .qr-box { flex-shrink: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 4px; }
  .qr-box img { display: block; width: 80px; height: 80px; }
  .info { flex: 1; }
  .info-row { margin-bottom: 5px; }
  .info-label { font-size: 6.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #9ca3af; }
  .info-value { font-size: 11px; font-weight: 600; color: #111827; margin-top: 1px; }
  .info-code { font-size: 13px; font-weight: 800; color: #4f46e5; font-family: monospace; margin-top: 1px; }
  .footer {
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    display: flex; justify-content: space-between; align-items: center;
    padding: 5px 12px;
  }
  .footer-text { font-size: 7px; color: #9ca3af; font-weight: 500; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="header-label">Student ID Card</div>
    <div class="header-name">${name}</div>
  </div>
  <div class="body">
    <div class="qr-box">
      <img src="${qrUrl}" alt="QR Code" />
    </div>
    <div class="info">
      <div class="info-row">
        <div class="info-label">Student ID</div>
        <div class="info-code">${studentCode}</div>
      </div>
      ${subject ? `<div class="info-row"><div class="info-label">Subject</div><div class="info-value">${subject}</div></div>` : ''}
      ${grade ? `<div class="info-row"><div class="info-label">Grade</div><div class="info-value">${grade}${batch ? ` · ${batch}` : ''}</div></div>` : ''}
      ${language ? `<div class="info-row"><div class="info-label">Language</div><div class="info-value">${language}</div></div>` : ''}
    </div>
  </div>
  <div class="footer">
    <span class="footer-text">Card v${cardVersion} · Easyclz</span>
    <span class="footer-text">Valid 30 days</span>
  </div>
</div>
</body>
</html>`;
}

export default function StudentQRScreen() {
  useScreenTitle('Student ID Card');
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeStore((s) => s.colors);
  const { student, loading, refresh } = useStudent(id);
  const [sharing, setSharing] = useState(false);
  const [whatsappAvailable, setWhatsappAvailable] = useState(false);

  useEffect(() => {
    Linking.canOpenURL('whatsapp://send').then(setWhatsappAvailable).catch(() => {});
  }, []);

  const QR = getQRComponent();
  const payload = student ? buildQrPayload(student.id, student.cardVersion) : '';

  function buildWhatsAppText(): string {
    if (!student) return '';
    const lines = [
      `🎓 *Student ID Card — Easyclz*`,
      ``,
      `*Name:* ${student.name}`,
      `*ID:* ${student.studentCode}`,
    ];
    if (student.grade) lines.push(`*Grade:* ${student.grade}${student.batch ? ` · ${student.batch}` : ''}`);
    if (student.subject) lines.push(`*Subject:* ${student.subject}`);
    if (student.language) lines.push(`*Language:* ${student.language}`);
    lines.push(``, `_Card v${student.cardVersion} · Valid 30 days_`);
    return lines.join('\n');
  }

  async function sendToWhatsApp() {
    const text = buildWhatsAppText();
    const waUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const canOpen = await Linking.canOpenURL(waUrl);
    if (canOpen) {
      await Linking.openURL(waUrl);
    } else {
      // WhatsApp not installed — fall back to the generic share sheet
      await Share.share({ message: text });
    }
  }

  function reissue() {
    if (!student) return;
    Alert.alert(
      'Reissue card?',
      'This invalidates any previously printed QR codes and generates a new card.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reissue',
          style: 'destructive',
          onPress: () => {
            try {
              bumpStudentCardVersion(student.id);
              refresh();
            } catch (e: unknown) {
              Alert.alert('Failed', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  async function shareAsPDF() {
    if (!student) return;
    setSharing(true);
    try {
      const html = buildCardHtml({
        name: student.name,
        studentCode: student.studentCode,
        subject: student.subject ?? '',
        grade: student.grade ?? '',
        batch: student.batch ?? '',
        language: student.language ?? '',
        cardVersion: student.cardVersion,
        qrPayload: payload,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `ID Card — ${student.name}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Sharing not available', 'PDF saved at: ' + uri);
      }
    } catch (e: unknown) {
      Alert.alert('Failed', (e as Error).message);
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.actions}>
        <Pressable
          onPress={reissue}
          hitSlop={8}
          disabled={!student}
          style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Reissue QR card"
        >
          <Text style={[styles.headerActionText, { color: student ? colors.danger : colors.textMuted }]}>
            Reissue
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={[styles.info, { color: colors.textMuted }]}>Loading…</Text>
        </View>
      ) : !student ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.border} />
          <Text style={[styles.info, { color: colors.textMuted }]}>Student not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64, alignItems: 'center' }}>
          {/* ID Card preview */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Card header */}
            <View style={styles.cardHeaderStripe}>
              <Text style={styles.cardHeaderLabel}>STUDENT ID CARD</Text>
              <Text style={styles.cardHeaderName}>{student.name}</Text>
            </View>

            {/* Card body: QR + info */}
            <View style={styles.cardBody}>
              <View style={styles.qrBox}>
                {QR ? (
                  <QR value={payload} size={110} backgroundColor="#ffffff" color="#000000" />
                ) : (
                  <View style={[styles.qrFallback, { borderColor: colors.border }]}>
                    <Ionicons name="qr-code-outline" size={32} color={colors.border} />
                  </View>
                )}
              </View>
              <View style={styles.cardInfo}>
                <InfoRow label="STUDENT ID" value={student.studentCode} accent colors={colors} />
                {student.subject ? <InfoRow label="SUBJECT" value={student.subject} colors={colors} /> : null}
                {student.grade ? <InfoRow label="GRADE" value={`${student.grade}${student.batch ? ` · ${student.batch}` : ''}`} colors={colors} /> : null}
                {student.language ? <InfoRow label="LANGUAGE" value={student.language} colors={colors} /> : null}
              </View>
            </View>

            <View style={[styles.cardFooterRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.cardFooter, { color: colors.textMuted }]}>Card v{student.cardVersion}</Text>
              <Text style={[styles.cardFooter, { color: colors.textMuted }]}>Valid 30 days · Easyclz</Text>
            </View>
          </View>

          {/* WhatsApp shortcut */}
          <Pressable
            onPress={sendToWhatsApp}
            style={({ pressed }) => [
              styles.shareBtn,
              { backgroundColor: '#25d366', opacity: pressed ? 0.8 : 1, marginBottom: 10 },
            ]}
            accessibilityLabel="Send student card to WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>
              {whatsappAvailable ? 'Send to WhatsApp' : 'Share via WhatsApp'}
            </Text>
          </Pressable>

          {/* Share as PDF button */}
          <Pressable
            onPress={shareAsPDF}
            disabled={sharing}
            style={({ pressed }) => [
              styles.shareBtn,
              { backgroundColor: '#4f46e5', opacity: sharing || pressed ? 0.75 : 1 },
            ]}
          >
            {sharing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="share-outline" size={18} color="#fff" />}
            <Text style={styles.shareBtnText}>
              {sharing ? 'Preparing PDF…' : 'Share / Print as PDF'}
            </Text>
          </Pressable>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            PDF is credit-card sized — print, cut out, and give to student.{'\n'}
            Student scans this QR at class to mark attendance or collect payment.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function InfoRow({ label, value, colors, accent }: {
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  accent?: boolean;
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.6, color: colors.textMuted, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{
        fontSize: accent ? 15 : 12,
        fontWeight: accent ? '800' : '600',
        color: accent ? colors.primary : colors.text,
        fontFamily: accent ? 'monospace' : undefined,
        marginTop: 1,
      }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  headerAction: {
    width: 72, height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8,
  },
  headerActionText: { fontSize: 14, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  info: { fontSize: 14 },

  card: {
    width: 320,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  cardHeaderStripe: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardHeaderLabel: {
    fontSize: 8, fontWeight: '800', letterSpacing: 1.5,
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
  },
  cardHeaderName: {
    fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 2, letterSpacing: -0.3,
  },
  cardBody: {
    flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
  },
  qrBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  qrFallback: {
    width: 110, height: 110,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  cardInfo: { flex: 1 },
  cardFooterRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardFooter: { fontSize: 9, fontWeight: '500' },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: 320,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  hint: {
    fontSize: 12, textAlign: 'center', lineHeight: 18,
    paddingHorizontal: 24, marginBottom: 8,
  },
});
