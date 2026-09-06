import { useCallback, useEffect, useState } from 'react';
import { messageTemplatesRepo } from '../../db/repositories/messageTemplatesRepo';
import { newId } from '../uuid';
import { useAuthStore } from '../auth/store';
import type { MessageTemplate } from '../../db/schema/messageTemplates';

// ─── Constants ────────────────────────────────────────────────────────────────

export const TEMPLATE_TYPES = [
  'payment_reminder',
  'payment_received',
  'attendance_absent',
  'attendance_summary',
  'class_cancel',
  'exam_result',
  'note_uploaded',
  'custom',
] as const;

export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  payment_reminder: 'Payment Reminder',
  payment_received: 'Payment Receipt',
  attendance_absent: 'Absence Alert',
  attendance_summary: 'Attendance Summary',
  class_cancel: 'Class Cancelled',
  exam_result: 'Exam Result',
  note_uploaded: 'Note Uploaded',
  custom: 'Custom Announcement',
};

export const TEMPLATE_LANGUAGES = ['english', 'sinhala', 'tamil', 'other'] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

// ─── Variables (§14.2) ────────────────────────────────────────────────────────

export const TEMPLATE_VARIABLES = [
  '{student_name}',
  '{parent_name}',
  '{class_name}',
  '{grade}',
  '{batch}',
  '{subject}',
  '{language}',
  '{month}',
  '{amount}',
  '{balance}',
  '{due_date}',
  '{exam_name}',
  '{marks}',
  '{rank}',
  '{teacher_name}',
] as const;

// ─── Default template bodies ──────────────────────────────────────────────────

export const DEFAULT_BODIES: Record<TemplateType, string> = {
  payment_reminder:
    'Dear {parent_name}, this is a reminder that {student_name}\'s class fee of {amount} for {month} is due by {due_date}. Please settle at your earliest convenience. - {teacher_name}',
  payment_received:
    'Dear {parent_name}, we received {amount} for {student_name}\'s {class_name} fee for {month}. Balance: {balance}. Thank you. - {teacher_name}',
  attendance_absent:
    'Dear {parent_name}, {student_name} was marked absent from {class_name} ({grade} {batch}) today. Please contact us if there is an issue. - {teacher_name}',
  attendance_summary:
    'Dear {parent_name}, {student_name}\'s attendance summary for {month} in {class_name} ({grade} {batch} {subject}) is ready. - {teacher_name}',
  class_cancel:
    'Dear {parent_name}, please note that {class_name} ({grade} {batch}) class for {student_name} has been cancelled today. We apologise for the inconvenience. - {teacher_name}',
  exam_result:
    'Dear {parent_name}, {student_name} scored {marks} in {exam_name}. Rank: {rank}. Well done! - {teacher_name}',
  note_uploaded:
    'Dear {parent_name}, new study notes for {subject} ({class_name} {grade} {batch}) have been uploaded for {student_name}. Please check the student portal. - {teacher_name}',
  custom:
    'Dear {parent_name}, {student_name} — {class_name}. - {teacher_name}',
};

// ─── Substitution engine ──────────────────────────────────────────────────────

export function renderTemplate(body: string, vars: Partial<Record<string, string>>): string {
  return body.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useTemplatesList() {
  const teacherId = useAuthStore((s) => s.teacher?.id ?? '');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await messageTemplatesRepo.findAll(teacherId);
      setTemplates(rows);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { templates, loading, refresh };
}

export function useTemplate(id: string) {
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    messageTemplatesRepo.findById(id).then((t) => { setTemplate(t); setLoading(false); });
  }, [id]);

  return { template, loading };
}

// ─── Save / update helpers ────────────────────────────────────────────────────

interface TemplateInput {
  type: TemplateType;
  language: TemplateLanguage;
  body: string;
  isDefault: boolean;
}

export async function saveTemplate(teacherId: string, input: TemplateInput): Promise<void> {
  const now = new Date().toISOString();
  // If marking as default, clear existing default for same type+language first
  if (input.isDefault) {
    await messageTemplatesRepo.clearDefault(teacherId, input.type, input.language);
  }
  await messageTemplatesRepo.insert({
    id: newId(),
    teacherId,
    type: input.type,
    language: input.language,
    body: input.body,
    isDefault: input.isDefault,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    clientUpdatedAt: now,
    syncedAt: null,
  });
}

export async function updateTemplate(
  teacherId: string,
  id: string,
  input: TemplateInput,
): Promise<void> {
  const now = new Date().toISOString();
  if (input.isDefault) {
    await messageTemplatesRepo.clearDefault(teacherId, input.type, input.language);
  }
  await messageTemplatesRepo.update(id, {
    type: input.type,
    language: input.language,
    body: input.body,
    isDefault: input.isDefault,
    updatedAt: now,
    clientUpdatedAt: now,
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  const now = new Date().toISOString();
  await messageTemplatesRepo.softDelete(id, now);
}
