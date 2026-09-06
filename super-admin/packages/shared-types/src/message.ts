import { z } from 'zod';
import { IsoDateTime, MonthKey, PhoneNumber, TenantEntity, Uuid } from './common';
import { Language, MessageChannel, MessageStatus, MessageType } from './enums';

export const MessageTemplateFields = z.object({
  type: MessageType,
  language: Language.default('english'),
  body: z.string().min(1).max(2000),
  is_default: z.boolean().default(false),
});

export const MessageTemplateEntity = TenantEntity.merge(MessageTemplateFields);
export type MessageTemplateEntity = z.infer<typeof MessageTemplateEntity>;

export const MessageTemplateCreateInput = MessageTemplateFields;
export type MessageTemplateCreateInput = z.infer<typeof MessageTemplateCreateInput>;

export const TemplateVariables = z.object({
  student_name: z.string().optional(),
  parent_name: z.string().optional(),
  class_name: z.string().optional(),
  grade: z.string().optional(),
  batch: z.string().optional(),
  subject: z.string().optional(),
  language: z.string().optional(),
  month: z.string().optional(),
  amount: z.string().optional(),
  due_date: z.string().optional(),
  exam_name: z.string().optional(),
  marks: z.string().optional(),
  rank: z.string().optional(),
  teacher_name: z.string().optional(),
});
export type TemplateVariables = z.infer<typeof TemplateVariables>;

export const MessageFields = z.object({
  type: MessageType,
  channel: MessageChannel.default('sms'),
  status: MessageStatus.default('queued'),
  recipient_phone: PhoneNumber,
  student_id: Uuid.nullable().default(null),
  class_id: Uuid.nullable().default(null),
  body: z.string().min(1).max(2000),
  scheduled_at: IsoDateTime.nullable().default(null),
  sent_at: IsoDateTime.nullable().default(null),
  delivered_at: IsoDateTime.nullable().default(null),
  failed_at: IsoDateTime.nullable().default(null),
  error: z.string().max(1000).nullable().default(null),
  retry_count: z.number().int().nonnegative().default(0),
  provider: z.string().max(50).nullable().default(null),
  provider_message_id: z.string().max(200).nullable().default(null),
  cost_cents: z.number().int().nonnegative().nullable().default(null),
});

export const MessageEntity = TenantEntity.merge(MessageFields);
export type MessageEntity = z.infer<typeof MessageEntity>;

export const MessageSearchFilter = z.object({
  type: MessageType.optional(),
  status: MessageStatus.optional(),
  class_id: Uuid.optional(),
  grade: z.string().optional(),
  batch: z.string().optional(),
  subject: z.string().optional(),
  language: Language.optional(),
  month: MonthKey.optional(),
  date_from: IsoDateTime.optional(),
  date_to: IsoDateTime.optional(),
});
export type MessageSearchFilter = z.infer<typeof MessageSearchFilter>;

export const ChatThreadEntity = TenantEntity.extend({
  student_id: Uuid,
  last_message_at: IsoDateTime.nullable().default(null),
  unread_for_teacher: z.number().int().nonnegative().default(0),
  unread_for_student: z.number().int().nonnegative().default(0),
});
export type ChatThreadEntity = z.infer<typeof ChatThreadEntity>;

export const ChatMessageEntity = TenantEntity.extend({
  thread_id: Uuid,
  sender_role: z.enum(['teacher', 'student']),
  sender_id: Uuid,
  body: z.string().min(1).max(4000),
  attachment_url: z.string().url().nullable().default(null),
  read_at: IsoDateTime.nullable().default(null),
});
export type ChatMessageEntity = z.infer<typeof ChatMessageEntity>;
