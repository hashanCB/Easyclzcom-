// Announce a new extra class to its students: SMS to each (parent/student phone)
// + a class chat broadcast. Best-effort — callers should not block on this.
import { Platform } from 'react-native';
import { sendSms, type SmsRecipient } from '../messages/sms';
import { broadcastChat } from '../chat';
import type { NewExtraClass } from '../../db/schema';

const SMS_CHUNK = 20;

function feeLine(extra: NewExtraClass): string {
  if (extra.feeMode === 'free') return 'Fee: Free';
  if (extra.feeMode === 'custom') return `Fee: Rs ${Math.round((extra.customFeeCents ?? 0) / 100).toLocaleString()}`;
  return 'Fee: your usual monthly fee';
}

function buildBody(className: string, extra: NewExtraClass, teacherName: string): string {
  const time = [extra.startTime, extra.endTime].filter(Boolean).join('–');
  const lines = [
    `Extra class — ${className}`,
    extra.topic ? `Topic: ${extra.topic}` : '',
    `Date: ${extra.date}${time ? ` ${time}` : ''}`,
    extra.location ? `Place: ${extra.location}` : '',
    feeLine(extra),
    `- ${teacherName}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export async function notifyExtraClass(args: {
  token: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  extra: NewExtraClass;
}): Promise<void> {
  const { token, teacherId, classId, className, extra, teacherName } = args;
  if (!token) return;
  const body = buildBody(className, extra, teacherName);

  // 1) Class chat broadcast (free, in-app).
  try {
    await broadcastChat('class', classId, body, token);
  } catch { /* best-effort */ }

  // 2) SMS to each student with a phone on file.
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { studentsRepo } = require('../../db/repositories/studentsRepo');
    const students = studentsRepo
      .findByClass(classId)
      .filter((s: { isActive: boolean; deletedAt: string | null }) => s.isActive && !s.deletedAt);
    const recipients: SmsRecipient[] = students
      .map((s: { id: string; parentMobile?: string | null; studentPhone?: string | null }) => {
        const phone = (s.parentMobile?.trim() || s.studentPhone?.trim() || '');
        return phone ? { recipient_phone: phone, body, student_id: s.id, class_id: classId } : null;
      })
      .filter(Boolean) as SmsRecipient[];
    for (let i = 0; i < recipients.length; i += SMS_CHUNK) {
      await sendSms('custom', recipients.slice(i, i + SMS_CHUNK), token).catch(() => {});
    }
  } catch { /* best-effort */ }
  void teacherId;
}
