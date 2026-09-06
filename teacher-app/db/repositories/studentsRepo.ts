import { eq, isNull, and, like, desc, sql, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import { students, studentClasses, type NewStudent, type Student } from '../schema';

/** Student IDs that have an active enrollment in the given class. */
function enrolledStudentIds(classId: string): string[] {
  return getDb()
    .select({ id: studentClasses.studentId })
    .from(studentClasses)
    .where(and(eq(studentClasses.classId, classId), isNull(studentClasses.deletedAt)))
    .all()
    .map((r) => r.id);
}

/**
 * SQL condition: the student belongs to `classId` — either via the new
 * many-to-many enrollments (student_classes) or the legacy primary class_id.
 */
function inClassCondition(classId: string) {
  const ids = enrolledStudentIds(classId);
  if (ids.length === 0) return eq(students.classId, classId);
  return sql`(${students.classId} = ${classId} OR ${inArray(students.id, ids)})`;
}

export interface StudentFilter {
  teacherId?: string;
  classId?: string;
  status?: 'active' | 'deactivated' | 'all';
  search?: string;
}

export const studentsRepo = {
  findAll(filter: StudentFilter = {}): Student[] {
    const conds = [isNull(students.deletedAt)];
    if (filter.teacherId) conds.push(eq(students.teacherId, filter.teacherId));
    if (filter.classId) conds.push(inClassCondition(filter.classId));
    if (filter.status === 'active') conds.push(eq(students.isActive, true));
    if (filter.status === 'deactivated') conds.push(eq(students.isActive, false));
    if (filter.search && filter.search.trim()) {
      const q = `%${filter.search.trim().toLowerCase()}%`;
      conds.push(
        sql`(lower(${students.name}) LIKE ${q} OR lower(${students.studentCode}) LIKE ${q})`,
      );
    }
    return getDb()
      .select()
      .from(students)
      .where(and(...conds))
      .orderBy(desc(students.createdAt))
      .all();
  },

  /**
   * The earliest month (YYYY-MM) any student joined — i.e. the min `createdAt`
   * across non-deleted students for the teacher, optionally scoped to one
   * class. `createdAt` is an ISO string, so a lexicographic MIN is correct and
   * the first 7 chars give the month. Returns null when there are no students.
   */
  earliestJoinMonth(teacherId: string, classId?: string): string | null {
    const conds = [eq(students.teacherId, teacherId), isNull(students.deletedAt)];
    if (classId) conds.push(eq(students.classId, classId));
    const row = getDb()
      .select({ min: sql<string | null>`MIN(${students.createdAt})` })
      .from(students)
      .where(and(...conds))
      .get();
    const min = row?.min;
    return min ? min.slice(0, 7) : null;
  },

  findByClass(classId: string): Student[] {
    return getDb()
      .select()
      .from(students)
      .where(and(inClassCondition(classId), isNull(students.deletedAt)))
      .all();
  },

  findById(id: string): Student | undefined {
    return getDb()
      .select()
      .from(students)
      .where(and(eq(students.id, id), isNull(students.deletedAt)))
      .get();
  },

  /**
   * Find a LIVE student in a class with this exact student_phone, optionally
   * excluding one id. Mirrors the cloud's `students_class_phone_uniq` index
   * (class_id, student_phone) so we can block a duplicate before it's saved and
   * gets stuck failing to sync. Only student_phone is checked — siblings sharing
   * a parent's mobile are allowed, exactly like the cloud constraint.
   */
  findActiveByStudentPhoneInClass(classId: string, phone: string, excludeId?: string): Student | undefined {
    const normalised = phone.replace(/\s+/g, '');
    if (!normalised) return undefined;
    const conds = [
      eq(students.classId, classId),
      isNull(students.deletedAt),
      eq(students.studentPhone, normalised),
    ];
    if (excludeId) conds.push(sql`${students.id} <> ${excludeId}`);
    return getDb().select().from(students).where(and(...conds)).get();
  },

  /** Find an active student in a class by phone (checks both student_phone and parent_mobile). */
  findByPhoneInClass(classId: string, phone: string): Student | undefined {
    const normalised = phone.replace(/\s+/g, '');
    return getDb()
      .select()
      .from(students)
      .where(
        and(
          eq(students.classId, classId),
          isNull(students.deletedAt),
          sql`(${students.studentPhone} = ${normalised} OR ${students.parentMobile} = ${normalised})`,
        ),
      )
      .get();
  },

  findByCode(code: string): Student | undefined {
    return getDb()
      .select()
      .from(students)
      .where(eq(students.studentCode, code))
      .get();
  },

  /**
   * Returns the next sequential student code in `STU-XXXX` format for the given teacher.
   */
  nextCode(teacherId: string): string {
    const rows = getDb()
      .select({ code: students.studentCode })
      .from(students)
      .where(and(eq(students.teacherId, teacherId), like(students.studentCode, 'STU-%')))
      .all();
    let max = 0;
    for (const r of rows) {
      const m = /^STU-(\d+)$/.exec(r.code);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (n > max) max = n;
      }
    }
    return `STU-${String(max + 1).padStart(4, '0')}`;
  },

  insert(data: NewStudent): void {
    getDb().insert(students).values(data).run();
  },

  update(id: string, data: Partial<NewStudent>): void {
    const now = new Date().toISOString();
    getDb()
      .update(students)
      // clientUpdatedAt must always bump so the sync push picks up the change.
      .set({ ...data, updatedAt: now, clientUpdatedAt: now })
      .where(eq(students.id, id))
      .run();
  },

  setActive(id: string, isActive: boolean): void {
    const now = new Date().toISOString();
    getDb()
      .update(students)
      .set({ isActive, updatedAt: now, clientUpdatedAt: now })
      .where(eq(students.id, id))
      .run();
  },

  /** Count of students awaiting their first payment (money gate). */
  countPendingPayment(teacherId: string): number {
    const rows = getDb()
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.teacherId, teacherId),
          eq(students.joinStatus, 'pending_payment'),
          isNull(students.deletedAt),
        ),
      )
      .all();
    return rows.length;
  },

  /** Return all 'pending_payment' students for a teacher (optional class scope). */
  findPendingPayment(teacherId: string, classId?: string): Student[] {
    const conds = [
      eq(students.teacherId, teacherId),
      eq(students.joinStatus, 'pending_payment'),
      isNull(students.deletedAt),
    ];
    if (classId) conds.push(eq(students.classId, classId));
    return getDb()
      .select()
      .from(students)
      .where(and(...conds))
      .orderBy(desc(students.createdAt))
      .all();
  },

  /**
   * Promote a student from 'pending_payment' to 'confirmed' when their first
   * payment is recorded. No-op if already confirmed. Bumps clientUpdatedAt so
   * the sync engine picks up the change and pushes it to the cloud.
   */
  confirmIfPending(id: string): void {
    const now = new Date().toISOString();
    getDb()
      .update(students)
      .set({ joinStatus: 'confirmed', updatedAt: now, clientUpdatedAt: now })
      .where(and(eq(students.id, id), eq(students.joinStatus, 'pending_payment')))
      .run();
  },

  /** Bumps card_version (used to invalidate old QR codes when reissuing a card). */
  bumpCardVersion(id: string): void {
    const now = new Date().toISOString();
    getDb()
      .update(students)
      .set({
        cardVersion: sql`${students.cardVersion} + 1`,
        updatedAt: now,
        clientUpdatedAt: now,
      })
      .where(eq(students.id, id))
      .run();
  },

  softDelete(id: string): void {
    const now = new Date().toISOString();
    getDb()
      .update(students)
      .set({ deletedAt: now, updatedAt: now, clientUpdatedAt: now })
      .where(eq(students.id, id))
      .run();
  },

  // backup/restore helpers
  deleteAllByTeacher(teacherId: string): void {
    getDb().delete(students).where(eq(students.teacherId, teacherId)).run();
  },

  upsert(data: NewStudent): void {
    getDb()
      .insert(students)
      .values(data)
      .onConflictDoUpdate({ target: students.id, set: { ...data } })
      .run();
  },
};
