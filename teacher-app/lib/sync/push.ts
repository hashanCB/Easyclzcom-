import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  classes,
  students,
  studentClasses,
  payments,
  paymentCorrections,
  attendance,
  notes,
  noteFiles,
  exams,
  marks,
  questionBank,
  extraClasses,
} from '../../db/schema';
import { supabaseUpsert, supabaseStudentCodes, supabaseStudentsByClassPhone, rowToApi } from './client';

const BATCH = 50;

// The cloud has a unique (teacher_id, student_code) constraint. Offline code
// generation (studentsRepo.nextCode counts only the local DB) can produce the
// same STU-#### on two devices for two different students, so a push then fails
// with this Postgres unique-violation. We detect it by name and self-heal.
function isDuplicateStudentCodeError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('students_teacher_id_student_code_key')
    || msg.includes('students_teacher_code_unique');
}

// The cloud has a partial unique index students_class_phone_uniq (class_id,
// student_phone). A duplicate phone in a class — usually the same student
// registered twice — makes the push 409 forever and wedges sync. We detect it
// here and self-heal by clearing the phone on the local duplicate so the row can
// upload; the teacher can re-enter the correct phone (and is then warned at save).
function isDuplicateStudentPhoneError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('students_class_phone_uniq');
}

// For each local row whose (class_id, student_phone) already belongs to a
// DIFFERENT live student in the cloud, blank the local phone so the row stops
// colliding. Returns how many rows were changed.
async function clearConflictingPhones(
  token: string,
  batch: { id: string; classId: string; studentPhone: string | null }[],
): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  let changed = 0;
  for (const row of batch) {
    const phone = row.studentPhone?.trim();
    if (!phone) continue;
    const matches = await supabaseStudentsByClassPhone(row.classId, phone, token);
    if (matches.some((m) => m.id !== row.id)) {
      db.update(students)
        .set({ studentPhone: null, updatedAt: now, clientUpdatedAt: now })
        .where(eq(students.id, row.id))
        .run();
      changed++;
    }
  }
  return changed;
}

// Pick the next STU-#### that is not already taken (locally or in the cloud).
function nextFreeCode(used: Set<string>): string {
  let max = 0;
  for (const c of used) {
    const m = /^STU-(\d+)$/.exec(c);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  let n = max + 1;
  let code = `STU-${String(n).padStart(4, '0')}`;
  while (used.has(code)) { n++; code = `STU-${String(n).padStart(4, '0')}`; }
  return code;
}

// Find rows where synced_at IS NULL (never pushed) or client_updated_at > synced_at (modified).
const unsyncedWhere = (table: { syncedAt: unknown; clientUpdatedAt?: unknown }) =>
  sql`(${table.syncedAt} IS NULL OR ${(table as { clientUpdatedAt: unknown }).clientUpdatedAt} > ${table.syncedAt})`;

// For append-only tables (payment_corrections) that have no clientUpdatedAt.
const neverSyncedWhere = (table: { syncedAt: unknown }) =>
  isNull(table.syncedAt as Parameters<typeof isNull>[0]);

const DAY_NORMALIZE: Record<string, string> = {
  mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
  fri: 'friday', sat: 'saturday', sun: 'sunday',
};

export async function pushClasses(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(classes)
    .where(and(eq(classes.teacherId, teacherId), unsyncedWhere(classes)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;
  await supabaseUpsert('classes', rows.map((r) => rowToApi(r, 'classes')), token);
  const now = new Date().toISOString();
  for (const row of rows) {
    // Normalize each day in comma-separated multi-day value
    // e.g. 'Mon,Wed' → 'monday,wednesday'
    const normalizedDay = row.classDay
      .split(',')
      .map((d: string) => {
        const lower = d.trim().toLowerCase();
        return DAY_NORMALIZE[lower.slice(0, 3)] ?? lower;
      })
      .join(',');
    db.update(classes)
      .set({ syncedAt: now, classDay: normalizedDay })
      .where(eq(classes.id, row.id))
      .run();
  }
  return rows.length;
}

export async function pushStudents(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(students)
    .where(and(eq(students.teacherId, teacherId), unsyncedWhere(students)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;

  try {
    await supabaseUpsert('students', rows.map((r) => rowToApi(r, 'students')), token);
  } catch (e) {
    const codeClash = isDuplicateStudentCodeError(e);
    const phoneClash = isDuplicateStudentPhoneError(e);
    if (!codeClash && !phoneClash) throw e;
    // A local student collides with a *different* cloud student — either on its
    // STU-#### code or on (class, phone). Heal whichever applies, then re-push.
    if (codeClash) await reassignConflictingCodes(teacherId, token, rows);
    if (phoneClash) await clearConflictingPhones(token, rows);
    const fresh = db
      .select()
      .from(students)
      .where(inArray(students.id, rows.map((r) => r.id)))
      .all();
    await supabaseUpsert('students', fresh.map((r) => rowToApi(r, 'students')), token);
    const ts = new Date().toISOString();
    for (const row of fresh) {
      db.update(students).set({ syncedAt: ts }).where(eq(students.id, row.id)).run();
    }
    return fresh.length;
  }

  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(students).set({ syncedAt: now }).where(eq(students.id, row.id)).run();
  }
  return rows.length;
}

// Reassign codes for local students whose STU-#### already belongs to a
// different student in the cloud, so the batch can upload without colliding.
async function reassignConflictingCodes(
  teacherId: string,
  token: string,
  batch: { id: string; studentCode: string }[],
): Promise<void> {
  const db = getDb();
  const cloud = await supabaseStudentCodes(teacherId, token);
  const cloudIdByCode = new Map(cloud.map((c) => [c.student_code, c.id]));

  // Every code already in use, locally or in the cloud — never reuse one.
  const used = new Set<string>(cloudIdByCode.keys());
  for (const r of db.select({ code: students.studentCode }).from(students)
    .where(eq(students.teacherId, teacherId)).all()) {
    used.add(r.code);
  }

  const now = new Date().toISOString();
  for (const row of batch) {
    const cloudId = cloudIdByCode.get(row.studentCode);
    if (cloudId && cloudId !== row.id) {
      const newCode = nextFreeCode(used);
      used.add(newCode);
      db.update(students)
        .set({ studentCode: newCode, updatedAt: now, clientUpdatedAt: now })
        .where(eq(students.id, row.id))
        .run();
    }
  }
}

// Class enrollments — each row is one student in one class with its own fee.
// Must push AFTER students (the cloud row FKs to students.id).
export async function pushStudentClasses(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(studentClasses)
    .where(and(eq(studentClasses.teacherId, teacherId), unsyncedWhere(studentClasses)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;
  await supabaseUpsert('student_classes', rows.map((r) => rowToApi(r, 'student_classes')), token);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(studentClasses).set({ syncedAt: now }).where(eq(studentClasses.id, row.id)).run();
  }
  return rows.length;
}

export async function pushPayments(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(payments)
    .where(and(eq(payments.teacherId, teacherId), unsyncedWhere(payments)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;
  await supabaseUpsert('payments', rows.map((r) => rowToApi(r, 'payments')), token);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(payments).set({ syncedAt: now }).where(eq(payments.id, row.id)).run();
  }
  return rows.length;
}

// The cloud payment_corrections schema differs from local (SYNC-5): it needs
// student_id/class_id/month + original/corrected amounts + done_by_*. We derive
// those from the parent payment. The local `amountCents` is the signed delta, so
// difference (generated cloud-side) = corrected − original = amountCents.
export async function pushPaymentCorrections(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(paymentCorrections)
    .where(and(eq(paymentCorrections.teacherId, teacherId), neverSyncedWhere(paymentCorrections)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;

  const cloudRows: Record<string, unknown>[] = [];
  const pushedIds: string[] = [];
  for (const r of rows) {
    const pay = db.select().from(payments).where(eq(payments.id, r.paymentId)).get();
    if (!pay) continue; // parent payment must exist to satisfy NOT NULL student/class/month
    cloudRows.push({
      id: r.id,
      teacher_id: r.teacherId,
      original_payment_id: r.paymentId,
      student_id: pay.studentId,
      class_id: pay.classId,
      month: pay.month,
      original_amount_cents: pay.amountCents,
      corrected_amount_cents: pay.amountCents + r.amountCents,
      // difference_amount_cents is GENERATED cloud-side — do not send it.
      reason: r.remark ?? 'correction',
      done_by_user_id: r.teacherId,
      done_by_role: 'teacher',
      done_at: r.createdAt,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      client_updated_at: r.updatedAt,
    });
    pushedIds.push(r.id);
  }
  if (cloudRows.length === 0) return 0;

  await supabaseUpsert('payment_corrections', cloudRows, token);
  const now = new Date().toISOString();
  for (const id of pushedIds) {
    db.update(paymentCorrections).set({ syncedAt: now }).where(eq(paymentCorrections.id, id)).run();
  }
  return pushedIds.length;
}

export async function pushAttendance(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(attendance)
    .where(and(eq(attendance.teacherId, teacherId), unsyncedWhere(attendance)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;
  await supabaseUpsert('attendance', rows.map((r) => rowToApi(r, 'attendance')), token);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(attendance).set({ syncedAt: now }).where(eq(attendance.id, row.id)).run();
  }
  return rows.length;
}

// Cloud `notes` requires grade/batch/subject/language NOT NULL — pulled from
// the parent class. note_type is collapsed into the cloud's is_today_special.
const KNOWN_LANGUAGES = new Set(['sinhala', 'english', 'tamil', 'other']);

function cloudLanguage(value: string | null): string {
  const lower = (value ?? '').toLowerCase();
  return KNOWN_LANGUAGES.has(lower) ? lower : 'other';
}

export async function pushNotes(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(notes)
    .where(and(eq(notes.teacherId, teacherId), unsyncedWhere(notes)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;

  const cloudRows: Record<string, unknown>[] = [];
  const pushedIds: string[] = [];
  for (const r of rows) {
    const cls = db.select().from(classes).where(eq(classes.id, r.classId)).get();
    if (!cls) continue; // can't satisfy NOT NULL grade/batch/subject/language
    cloudRows.push({
      id: r.id,
      teacher_id: r.teacherId,
      class_id: r.classId,
      title: r.title,
      topic: r.topic,
      grade: cls.grade,
      batch: cls.batch,
      subject: cls.subject,
      language: cloudLanguage(cls.language),
      date: r.noteDate,
      link_url: r.linkUrl,
      remark: r.remark,
      is_today_special: r.noteType === 'today',
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      deleted_at: r.deletedAt,
      client_updated_at: r.clientUpdatedAt,
    });
    pushedIds.push(r.id);
  }
  if (cloudRows.length === 0) return 0;

  await supabaseUpsert('notes', cloudRows, token);
  const now = new Date().toISOString();
  for (const id of pushedIds) {
    db.update(notes).set({ syncedAt: now }).where(eq(notes.id, id)).run();
  }
  return pushedIds.length;
}

function fileKind(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('word') || mime.includes('presentation') || mime.includes('document')) {
    return 'document';
  }
  return 'other';
}

export async function pushNoteFiles(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(noteFiles)
    .where(and(eq(noteFiles.teacherId, teacherId), unsyncedWhere(noteFiles)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;

  const cloudRows = rows.map((r) => ({
    id: r.id,
    teacher_id: r.teacherId,
    note_id: r.noteId,
    kind: fileKind(r.mimeType),
    filename: r.filename,
    storage_key: r.r2Key,
    size_bytes: r.sizeBytes ?? 0,
    mime_type: r.mimeType,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    deleted_at: r.deletedAt,
    client_updated_at: r.clientUpdatedAt,
  }));

  await supabaseUpsert('note_files', cloudRows, token);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(noteFiles).set({ syncedAt: now }).where(eq(noteFiles.id, row.id)).run();
  }
  return rows.length;
}

export async function pushExams(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(exams)
    .where(and(eq(exams.teacherId, teacherId), unsyncedWhere(exams)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;
  await supabaseUpsert('exams', rows.map((r) => rowToApi(r, 'exams')), token);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(exams).set({ syncedAt: now }).where(eq(exams.id, row.id)).run();
  }
  return rows.length;
}

export async function pushMarks(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(marks)
    .where(and(eq(marks.teacherId, teacherId), unsyncedWhere(marks)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;
  await supabaseUpsert('marks', rows.map((r) => rowToApi(r, 'marks')), token);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(marks).set({ syncedAt: now }).where(eq(marks.id, row.id)).run();
  }
  return rows.length;
}

export async function pushQuestionBank(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(questionBank)
    .where(and(eq(questionBank.teacherId, teacherId), unsyncedWhere(questionBank)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;
  await supabaseUpsert('question_bank', rows.map((r) => rowToApi(r, 'question_bank')), token);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(questionBank).set({ syncedAt: now }).where(eq(questionBank.id, row.id)).run();
  }
  return rows.length;
}

export async function pushExtraClasses(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const rows = db
    .select()
    .from(extraClasses)
    .where(and(eq(extraClasses.teacherId, teacherId), unsyncedWhere(extraClasses)))
    .limit(BATCH)
    .all();
  if (rows.length === 0) return 0;
  await supabaseUpsert('extra_classes', rows.map((r) => rowToApi(r, 'extra_classes')), token);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.update(extraClasses).set({ syncedAt: now }).where(eq(extraClasses.id, row.id)).run();
  }
  return rows.length;
}

export interface PushCounts {
  classes: number;
  students: number;
  studentClasses: number;
  payments: number;
  attendance: number;
  notes: number;
  exams: number;
  marks: number;
}

export async function pushAll(teacherId: string, token: string): Promise<PushCounts> {
  // Classes and students go first — student_classes / payments / attendance all
  // FK to them in the cloud, so they must already exist there.
  const [classes, students] = await Promise.all([
    pushClasses(teacherId, token),
    pushStudents(teacherId, token),
  ]);
  const [studentClasses, payments, , attendance, notes, , exams, marks] = await Promise.all([
    pushStudentClasses(teacherId, token),
    pushPayments(teacherId, token),
    pushPaymentCorrections(teacherId, token),
    pushAttendance(teacherId, token),
    pushNotes(teacherId, token),
    pushNoteFiles(teacherId, token),
    pushExams(teacherId, token),
    pushMarks(teacherId, token),
  ]);
  // Question bank + extra classes FK only to classes — push after classes land.
  await pushQuestionBank(teacherId, token);
  await pushExtraClasses(teacherId, token);
  return { classes, students, studentClasses, payments, attendance, notes, exams, marks };
}
