import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { studentClasses, type StudentClass } from '../schema';
import { newId } from '../../lib/uuid';

export interface EnrollmentInput {
  classId: string;
  feeType: string;          // 'regular' | 'free' | 'custom'
  customFeeCents: number | null;
}

export const studentClassesRepo = {
  /** Active (non-deleted) enrollments for one student. */
  findByStudent(studentId: string): StudentClass[] {
    return getDb()
      .select()
      .from(studentClasses)
      .where(and(eq(studentClasses.studentId, studentId), isNull(studentClasses.deletedAt)))
      .all();
  },

  /** Active enrollments in one class. */
  findByClass(classId: string): StudentClass[] {
    return getDb()
      .select()
      .from(studentClasses)
      .where(and(eq(studentClasses.classId, classId), isNull(studentClasses.deletedAt)))
      .all();
  },

  /** Student IDs enrolled in a class (active enrollments only). */
  studentIdsForClass(classId: string): string[] {
    return this.findByClass(classId).map((r) => r.studentId);
  },

  /** The single enrollment row for a (student, class) pair, if any. */
  findOne(studentId: string, classId: string): StudentClass | undefined {
    return getDb()
      .select()
      .from(studentClasses)
      .where(
        and(
          eq(studentClasses.studentId, studentId),
          eq(studentClasses.classId, classId),
          isNull(studentClasses.deletedAt),
        ),
      )
      .get();
  },

  /**
   * Replace a student's full set of enrollments with `items`. Existing rows not
   * in the new set are soft-deleted; rows already present are updated in place
   * (keeping their id); new classes are inserted. Idempotent and sync-friendly.
   */
  replaceForStudent(teacherId: string, studentId: string, items: EnrollmentInput[]): void {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db
      .select()
      .from(studentClasses)
      .where(eq(studentClasses.studentId, studentId))
      .all();
    const existingByClass = new Map(existing.map((r) => [r.classId, r]));
    const keepClassIds = new Set(items.map((i) => i.classId));

    // Soft-delete enrollments the student is no longer in.
    for (const row of existing) {
      if (!keepClassIds.has(row.classId) && !row.deletedAt) {
        db.update(studentClasses)
          .set({ deletedAt: now, isActive: false, updatedAt: now, clientUpdatedAt: now })
          .where(eq(studentClasses.id, row.id))
          .run();
      }
    }

    // Upsert the desired set.
    for (const item of items) {
      const prev = existingByClass.get(item.classId);
      if (prev) {
        db.update(studentClasses)
          .set({
            feeType: item.feeType,
            customFeeCents: item.customFeeCents,
            isActive: true,
            deletedAt: null,
            updatedAt: now,
            clientUpdatedAt: now,
          })
          .where(eq(studentClasses.id, prev.id))
          .run();
      } else {
        db.insert(studentClasses)
          .values({
            id: newId(),
            teacherId,
            studentId,
            classId: item.classId,
            feeType: item.feeType,
            customFeeCents: item.customFeeCents,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            clientUpdatedAt: now,
          })
          .run();
      }
    }
  },

  /** Soft-delete every enrollment for a student (used when a student is removed). */
  softDeleteForStudent(studentId: string): void {
    const now = new Date().toISOString();
    getDb()
      .update(studentClasses)
      .set({ deletedAt: now, isActive: false, updatedAt: now, clientUpdatedAt: now })
      .where(and(eq(studentClasses.studentId, studentId), isNull(studentClasses.deletedAt)))
      .run();
  },

  /** Map of classId → enrollment for one student (active only). */
  enrollmentMap(studentId: string): Map<string, StudentClass> {
    return new Map(this.findByStudent(studentId).map((r) => [r.classId, r]));
  },

  // backup/restore helpers
  findAllByTeacher(teacherId: string): StudentClass[] {
    return getDb()
      .select()
      .from(studentClasses)
      .where(eq(studentClasses.teacherId, teacherId))
      .all();
  },

  deleteAllByTeacher(teacherId: string): void {
    getDb().delete(studentClasses).where(eq(studentClasses.teacherId, teacherId)).run();
  },

  upsert(data: typeof studentClasses.$inferInsert): void {
    getDb()
      .insert(studentClasses)
      .values(data)
      .onConflictDoUpdate({ target: studentClasses.id, set: { ...data } })
      .run();
  },

  /** Helper kept for callers that have a list of class ids. */
  enrollmentsForClasses(classIds: string[]): StudentClass[] {
    if (classIds.length === 0) return [];
    return getDb()
      .select()
      .from(studentClasses)
      .where(and(inArray(studentClasses.classId, classIds), isNull(studentClasses.deletedAt)))
      .all();
  },
};
