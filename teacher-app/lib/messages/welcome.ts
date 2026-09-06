// Sends a new student their "you're registered" SMS: the class join code for
// the student portal plus their Student ID. Fired from the Add Student screen
// when the "Send welcome SMS" toggle is on.
import { STUDENT_PORTAL_URL } from '../constants';
import { fetchClassJoinCode, formatJoinCode } from '../students/joinRequests';
import { sendSms } from './sms';

export interface WelcomeSmsParams {
  token: string;
  classId: string;
  className: string;
  teacherName: string;
  studentId: string; // local DB id (for the message log)
  studentName: string;
  studentCode: string;
  password: string | null;
  recipientPhone: string;
}

export async function sendStudentWelcomeSms(p: WelcomeSmsParams): Promise<void> {
  // The permanent class code — the student creates a portal account and
  // requests to join with it; the teacher then accepts the request.
  const code = await fetchClassJoinCode(p.classId, p.token);

  const firstName = p.studentName.trim().split(/\s+/)[0] || 'there';
  const withTeacher = p.teacherName ? ` with ${p.teacherName}` : '';
  const joinPart = code
    ? ` Join the student portal at ${STUDENT_PORTAL_URL} — tap "Join a Class" and enter code ${formatJoinCode(code)}.`
    : ` Join the student portal at ${STUDENT_PORTAL_URL}.`;

  const body =
    `Hi ${firstName}, you're registered for ${p.className}${withTeacher}.` +
    joinPart +
    ` Your Student ID: ${p.studentCode}.`;

  await sendSms(
    'custom',
    [{ recipient_phone: p.recipientPhone, body, student_id: p.studentId, class_id: p.classId }],
    p.token,
  );
}
