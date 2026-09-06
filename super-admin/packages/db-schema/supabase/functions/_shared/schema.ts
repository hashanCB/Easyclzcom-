// Zod input schemas for every edge function. Centralised so the client SDK
// can import the same shapes (paste-imported, since edge runtime is Deno).

import { z } from 'https://esm.sh/zod@3.23.8';

export const CreateTeacherInput = z.object({
  username: z.string().min(3).max(50).regex(/^[a-z0-9_.-]+$/i, 'Letters, digits, _ . - only'),
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional(),
});
export type CreateTeacherInput = z.infer<typeof CreateTeacherInput>;

export const ActivateTeacherInput = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
  token: z.string().regex(/^\d{12}$/, 'Token must be 12 digits'),
  device_id: z.string().min(1).max(200),
  device_info: z.record(z.string()).optional(),
});
export type ActivateTeacherInput = z.infer<typeof ActivateTeacherInput>;

// --- Teacher self-registration (public, OTP-verified) -----------------------
// Step 1: send an OTP to the phone after checking username/phone availability.
export const RegisterTeacherRequestInput = z.object({
  name: z.string().min(1).max(120).optional(),
  username: z.string().min(3).max(50).regex(/^[a-z0-9_.-]+$/i, 'Letters, digits, _ . - only'),
  phone: z.string().min(7).max(20),
  // Optional in the schema so older app builds keep working; the current app
  // collects it as a required field and saves it onto the teacher account.
  email: z.string().email().max(190).optional(),
});
export type RegisterTeacherRequestInput = z.infer<typeof RegisterTeacherRequestInput>;

// Step 2: verify the OTP and create + auto-activate the account on this device.
// The password is supplied here (never stored during step 1).
export const RegisterTeacherConfirmInput = z.object({
  name: z.string().min(1).max(120).optional(),
  username: z.string().min(3).max(50).regex(/^[a-z0-9_.-]+$/i, 'Letters, digits, _ . - only'),
  phone: z.string().min(7).max(20),
  email: z.string().email().max(190).optional(),
  password: z.string().min(8).max(100),
  otp: z.string().length(6),
  device_id: z.string().min(1).max(200),
  device_info: z.record(z.string()).optional(),
  // Package the teacher picked for their free trial (starter/basic/growth/
  // unlimited). Optional — older builds don't send it; defaults to 'growth'.
  plan_code: z.string().min(1).max(50).optional(),
});
export type RegisterTeacherConfirmInput = z.infer<typeof RegisterTeacherConfirmInput>;

export const LoginTeacherInput = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
  device_id: z.string().min(1).max(200),
  device_info: z.record(z.string()).optional(),
  // Auto-evict (newest-device-wins): when the account is bound to a DIFFERENT
  // device, the first call returns { requires_device_switch } so the app can
  // confirm with the teacher. Re-calling with confirm_switch:true re-binds this
  // device and logs the previous phone out (via the session fence).
  confirm_switch: z.boolean().optional(),
});
export type LoginTeacherInput = z.infer<typeof LoginTeacherInput>;

export const ChangePasswordInput = z
  .object({
    current_password: z.string().min(8),
    new_password: z.string().min(8).max(100),
    confirm_password: z.string().min(8).max(100),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'New password and confirmation must match',
    path: ['confirm_password'],
  });
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

// ---- Student auth (U29) ----------------------------------------------------

export const ProvisionStudentCredentialInput = z.object({
  student_id: z.string().uuid('student_id must be a UUID'),
  password: z.string().regex(/^\d{6}$/, 'Password must be exactly 6 digits'),
});
export type ProvisionStudentCredentialInput = z.infer<typeof ProvisionStudentCredentialInput>;

export const StudentLoginInput = z.object({
  teacher_username: z.string().min(3).max(50),
  student_code: z.string().min(1).max(50),
  password: z.string().regex(/^\d{6}$/, 'Password must be exactly 6 digits'),
});
export type StudentLoginInput = z.infer<typeof StudentLoginInput>;

// ---- Assistant management (U31) --------------------------------------------

const ClassPermissionInput = z.object({
  class_id: z.string().uuid(),
  // Attendance/payment grant. Null = no attendance/payment access (e.g. an
  // assistant who can ONLY register students). "both" = attendance + payment.
  permission: z.enum(['attendance', 'payment', 'both']).nullable().optional(),
  // Independent capability: may this assistant register new students in the class?
  can_add_student: z.boolean().optional().default(false),
});

export const CreateAssistantInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  class_permissions: z.array(ClassPermissionInput).max(20),
});
export type CreateAssistantInput = z.infer<typeof CreateAssistantInput>;

export const UpdateAssistantInput = z.object({
  assistant_id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(7).max(20).optional(),
  is_active: z.boolean().optional(),
  class_permissions: z.array(ClassPermissionInput).max(20).optional(),
});
export type UpdateAssistantInput = z.infer<typeof UpdateAssistantInput>;

// ---- SMS sending (U34) ------------------------------------------------------

const MESSAGE_TYPES = [
  'payment_reminder', 'attendance_absent', 'attendance_summary',
  'class_cancel', 'exam_result', 'note_uploaded', 'custom',
] as const;

const SmsRecipientInput = z.object({
  recipient_phone: z.string().min(7).max(20),
  body: z.string().min(1).max(1000),
  student_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
});

// text.lk per-recipient caps a single request at 20 recipients.
export const SendSmsInput = z.object({
  type: z.enum(MESSAGE_TYPES).default('custom'),
  messages: z.array(SmsRecipientInput).min(1).max(20),
});
export type SendSmsInput = z.infer<typeof SendSmsInput>;

// ---- Chat broadcast (U37) ---------------------------------------------------

export const BroadcastChatInput = z.object({
  target: z.object({
    kind: z.enum(['all', 'paid', 'unpaid', 'class', 'grade', 'batch', 'subject', 'language']),
    value: z.string().min(1).max(120).optional(),  // required for class/grade/batch/subject/language
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),  // for paid/unpaid; defaults to current
    payment: z.enum(['paid', 'unpaid']).optional(),  // sub-filter for kind='class': only paid/unpaid in that class
  }),
  body: z.string().min(1).max(2000),
});
export type BroadcastChatInput = z.infer<typeof BroadcastChatInput>;
