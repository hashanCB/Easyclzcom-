import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  classes,
  students,
  studentClasses,
  payments,
  paymentCorrections,
  attendance,
  exams,
  marks,
  questionBank,
  extraClasses,
  notes,
  noteFiles,
  syncCursor,
  type Class,
  type Student,
  type NewStudent,
  type NewStudentClass,
  type NewPayment,
  type NewPaymentCorrection,
  type NewAttendance,
  type NewExam,
  type NewMark,
  type NewQuestionBankItem,
  type NewExtraClass,
  type NewNote,
  type NewNoteFile,
} from '../../db/schema';
import { supabasePull, apiToRow } from './client';

const EPOCH = '1970-01-01T00:00:00.000Z';

// ── Cursor helpers ────────────────────────────────────────────────────────────

function getCursor(tableName: string): string {
  const db = getDb();
  const row = db
    .select()
    .from(syncCursor)
    .where(eq(syncCursor.tableName, tableName))
    .get();
  return row?.lastPulledAt ?? EPOCH;
}

function setCursor(tableName: string, ts: string): void {
  const db = getDb();
  db
    .insert(syncCursor)
    .values({ tableName, lastPulledAt: ts })
    .onConflictDoUpdate({ target: syncCursor.tableName, set: { lastPulledAt: ts } })
    .run();
}

// ── Latest-wins conflict check ────────────────────────────────────────────────

function remoteIsNewer(
  remoteTs: string | null | undefined,
  localTs: string | null | undefined,
): boolean {
  if (!remoteTs) return false;
  if (!localTs) return true;
  return remoteTs > localTs;
}

// ── Table-specific pull functions ─────────────────────────────────────────────

export async function pullClasses(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('classes');
  const remote = await supabasePull('classes', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as unknown as Class;
    if (row.updatedAt > maxTs) maxTs = row.updatedAt;
    const local = db.select().from(classes).where(eq(classes.id, row.id)).get();

    if (!local) {
      db.insert(classes).values({ ...row, syncedAt: now }).run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(classes).set({ ...rest, syncedAt: now }).where(eq(classes.id, id)).run();
      count++;
    }
  }

  setCursor('classes', maxTs);
  return count;
}

export async function pullStudents(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('students');
  const remote = await supabasePull('students', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as unknown as Student;
    if (row.updatedAt > maxTs) maxTs = row.updatedAt;
    const local = db.select().from(students).where(eq(students.id, row.id)).get();

    if (!local) {
      const { id, ...rest } = row;
      // Use upsert on student_code conflict (per-teacher unique) so that a
      // student pulled from cloud never crashes if the code already exists
      // locally under a different row (e.g. after a restore + re-sync).
      db.insert(students)
        .values({ ...row, syncedAt: now } as NewStudent)
        .onConflictDoUpdate({
          target: [students.teacherId, students.studentCode],
          set: { ...rest, syncedAt: now },
        })
        .run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(students).set({ ...rest, syncedAt: now }).where(eq(students.id, id)).run();
      count++;
    }
  }

  setCursor('students', maxTs);
  return count;
}

export async function pullStudentClasses(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('student_classes');
  const remote = await supabasePull('student_classes', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as Record<string, unknown>;
    if ((row.updatedAt as string) > maxTs) maxTs = row.updatedAt as string;
    const local = db.select().from(studentClasses).where(eq(studentClasses.id, row.id as string)).get();

    if (!local) {
      db.insert(studentClasses).values({ ...(row as unknown as NewStudentClass), syncedAt: now }).run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt as string, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(studentClasses).set({ ...(rest as Partial<NewStudentClass>), syncedAt: now }).where(eq(studentClasses.id, id as string)).run();
      count++;
    }
  }

  setCursor('student_classes', maxTs);
  return count;
}

export async function pullPayments(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('payments');
  const remote = await supabasePull('payments', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as Record<string, unknown>;
    if ((row.updatedAt as string) > maxTs) maxTs = row.updatedAt as string;
    const local = db.select().from(payments).where(eq(payments.id, row.id as string)).get();

    // Per SRS §23.3: never overwrite existing payment records from pull.
    // Only insert new payments discovered from another device.
    if (!local) {
      db.insert(payments).values({ ...(row as unknown as NewPayment), syncedAt: now }).run();
      count++;
    }
  }

  setCursor('payments', maxTs);
  return count;
}

export async function pullAttendance(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('attendance');
  const remote = await supabasePull('attendance', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as Record<string, unknown>;
    if ((row.updatedAt as string) > maxTs) maxTs = row.updatedAt as string;
    const local = db.select().from(attendance).where(eq(attendance.id, row.id as string)).get();

    if (!local) {
      db.insert(attendance).values({ ...(row as unknown as NewAttendance), syncedAt: now }).run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt as string, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(attendance).set({ ...(rest as Partial<NewAttendance>), syncedAt: now }).where(eq(attendance.id, id as string)).run();
      count++;
    }
  }

  setCursor('attendance', maxTs);
  return count;
}

export async function pullExams(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('exams');
  const remote = await supabasePull('exams', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as Record<string, unknown>;
    if ((row.updatedAt as string) > maxTs) maxTs = row.updatedAt as string;
    const local = db.select().from(exams).where(eq(exams.id, row.id as string)).get();

    if (!local) {
      db.insert(exams).values({ ...(row as unknown as NewExam), syncedAt: now }).run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt as string, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(exams).set({ ...(rest as Partial<NewExam>), syncedAt: now }).where(eq(exams.id, id as string)).run();
      count++;
    }
  }

  setCursor('exams', maxTs);
  return count;
}

export async function pullMarks(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('marks');
  const remote = await supabasePull('marks', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as Record<string, unknown>;
    if ((row.updatedAt as string) > maxTs) maxTs = row.updatedAt as string;
    const local = db.select().from(marks).where(eq(marks.id, row.id as string)).get();

    if (!local) {
      db.insert(marks).values({ ...(row as unknown as NewMark), syncedAt: now }).run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt as string, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(marks).set({ ...(rest as Partial<NewMark>), syncedAt: now }).where(eq(marks.id, id as string)).run();
      count++;
    }
  }

  setCursor('marks', maxTs);
  return count;
}

// Payment corrections are append-only (SRS §23.3) — insert-only, never updated.
// Cloud schema differs from local (SYNC-5): map original_payment_id→paymentId,
// difference_amount_cents→signed amountCents, reason→remark, derive type by sign.
export async function pullPaymentCorrections(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('payment_corrections');
  const remote = await supabasePull('payment_corrections', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  const now = new Date().toISOString();
  let maxTs = cursor;

  for (const apiRow of remote) {
    const c = apiRow as Record<string, unknown>;
    const updatedAt = (c.updated_at as string) ?? (c.created_at as string);
    if (updatedAt > maxTs) maxTs = updatedAt;

    const id = c.id as string;
    const local = db.select().from(paymentCorrections).where(eq(paymentCorrections.id, id)).get();
    if (local) continue;

    const diff = Number(c.difference_amount_cents ?? 0);
    const localRow: NewPaymentCorrection = {
      id,
      teacherId: c.teacher_id as string,
      paymentId: c.original_payment_id as string,
      type: diff < 0 ? 'refund' : 'correction',
      amountCents: diff,
      remark: (c.reason as string | null) ?? null,
      createdAt: (c.created_at as string) ?? now,
      updatedAt,
      syncedAt: now,
    };
    db.insert(paymentCorrections).values(localRow).run();
    count++;
  }

  setCursor('payment_corrections', maxTs);
  return count;
}

// Cloud `notes` collapses note_type into is_today_special and stores grade/batch/
// subject/language denormalized. Reverse-map back to the local shape on pull.
function cloudNoteToLocal(api: Record<string, unknown>): NewNote {
  const row = apiToRow(api) as Record<string, unknown>;
  const isToday = row.isTodaySpecial === true;
  const linkUrl = (row.linkUrl as string | null) ?? null;
  const topic = (row.topic as string | null) ?? null;
  const noteType = linkUrl ? 'link' : isToday ? 'today' : topic ? 'topic' : 'normal';
  return {
    id: row.id as string,
    teacherId: row.teacherId as string,
    classId: row.classId as string,
    title: row.title as string,
    topic,
    grade: (row.grade as string | null) ?? null,
    batch: (row.batch as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    language: (row.language as string | null) ?? null,
    noteDate: (row.date as string) ?? (row.noteDate as string),
    noteType,
    linkUrl,
    remark: (row.remark as string | null) ?? null,
    deletedAt: (row.deletedAt as string | null) ?? null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    clientUpdatedAt: (row.clientUpdatedAt as string | null) ?? null,
  };
}

export async function pullNotes(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('notes');
  const remote = await supabasePull('notes', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  const now = new Date().toISOString();
  let maxTs = cursor;

  for (const apiRow of remote) {
    const row = cloudNoteToLocal(apiRow);
    if ((row.updatedAt as string) > maxTs) maxTs = row.updatedAt as string;
    const local = db.select().from(notes).where(eq(notes.id, row.id as string)).get();
    if (!local) {
      db.insert(notes).values({ ...row, syncedAt: now }).run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(notes).set({ ...rest, syncedAt: now }).where(eq(notes.id, id as string)).run();
      count++;
    }
  }

  setCursor('notes', maxTs);
  return count;
}

export async function pullNoteFiles(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('note_files');
  const remote = await supabasePull('note_files', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  const now = new Date().toISOString();
  let maxTs = cursor;

  for (const apiRow of remote) {
    const r = apiToRow(apiRow) as Record<string, unknown>;
    if ((r.updatedAt as string) > maxTs) maxTs = r.updatedAt as string;
    const local = db.select().from(noteFiles).where(eq(noteFiles.id, r.id as string)).get();
    const localRow: NewNoteFile = {
      id: r.id as string,
      noteId: r.noteId as string,
      teacherId: r.teacherId as string,
      filename: r.filename as string,
      mimeType: (r.mimeType as string) ?? 'application/octet-stream',
      sizeBytes: (r.sizeBytes as number | null) ?? null,
      r2Key: (r.storageKey as string) ?? (r.r2Key as string),
      deletedAt: (r.deletedAt as string | null) ?? null,
      createdAt: r.createdAt as string,
      updatedAt: r.updatedAt as string,
    };
    if (!local) {
      db.insert(noteFiles).values({ ...localRow, syncedAt: now }).run();
      count++;
    } else if ((localRow.updatedAt as string) > (local.updatedAt ?? '')) {
      const { id, ...rest } = localRow;
      db.update(noteFiles).set({ ...rest, syncedAt: now }).where(eq(noteFiles.id, id as string)).run();
      count++;
    }
  }

  setCursor('note_files', maxTs);
  return count;
}

export async function pullQuestionBank(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('question_bank');
  const remote = await supabasePull('question_bank', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as Record<string, unknown>;
    if ((row.updatedAt as string) > maxTs) maxTs = row.updatedAt as string;
    const local = db.select().from(questionBank).where(eq(questionBank.id, row.id as string)).get();
    if (!local) {
      db.insert(questionBank).values({ ...(row as unknown as NewQuestionBankItem), syncedAt: now }).run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt as string, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(questionBank).set({ ...(rest as Partial<NewQuestionBankItem>), syncedAt: now }).where(eq(questionBank.id, id as string)).run();
      count++;
    }
  }

  setCursor('question_bank', maxTs);
  return count;
}

export async function pullExtraClasses(teacherId: string, token: string): Promise<number> {
  const db = getDb();
  const cursor = getCursor('extra_classes');
  const remote = await supabasePull('extra_classes', teacherId, cursor, token);
  if (remote.length === 0) return 0;

  let count = 0;
  let maxTs = cursor;
  const now = new Date().toISOString();

  for (const apiRow of remote) {
    const row = apiToRow(apiRow) as Record<string, unknown>;
    if ((row.updatedAt as string) > maxTs) maxTs = row.updatedAt as string;
    const local = db.select().from(extraClasses).where(eq(extraClasses.id, row.id as string)).get();
    if (!local) {
      db.insert(extraClasses).values({ ...(row as unknown as NewExtraClass), syncedAt: now }).run();
      count++;
    } else if (remoteIsNewer(row.clientUpdatedAt as string, local.clientUpdatedAt)) {
      const { id, ...rest } = row;
      db.update(extraClasses).set({ ...(rest as Partial<NewExtraClass>), syncedAt: now }).where(eq(extraClasses.id, id as string)).run();
      count++;
    }
  }

  setCursor('extra_classes', maxTs);
  return count;
}

export async function pullAll(teacherId: string, token: string): Promise<void> {
  await pullClasses(teacherId, token);
  await pullStudents(teacherId, token);
  await pullStudentClasses(teacherId, token);
  await pullPayments(teacherId, token);
  await pullPaymentCorrections(teacherId, token);
  await pullAttendance(teacherId, token);
  await pullExams(teacherId, token);
  await pullMarks(teacherId, token);
  await pullQuestionBank(teacherId, token);
  await pullExtraClasses(teacherId, token);
  await pullNotes(teacherId, token);
  await pullNoteFiles(teacherId, token);
}
