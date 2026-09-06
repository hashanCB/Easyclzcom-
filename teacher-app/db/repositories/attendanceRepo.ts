import { eq, isNull, and, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { attendance, type NewAttendance, type Attendance } from '../schema';

export const attendanceRepo = {
  findByClassAndDate(classId: string, date: string): Attendance[] {
    return getDb()
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.classId, classId),
          eq(attendance.date, date),
          // Regular class attendance only — extra-class marks are kept separate.
          isNull(attendance.extraClassId),
          isNull(attendance.deletedAt),
        ),
      )
      .all();
  },

  /** All attendance rows for a class in a given month (YYYY-MM). Regular sessions only. */
  findByClassAndMonth(classId: string, month: string): Attendance[] {
    return getDb()
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.classId, classId),
          sql`${attendance.date} LIKE ${month + '-%'}`,
          isNull(attendance.extraClassId),
          isNull(attendance.deletedAt),
        ),
      )
      .all();
  },

  findByStudent(studentId: string): Attendance[] {
    return getDb()
      .select()
      .from(attendance)
      .where(and(eq(attendance.studentId, studentId), isNull(attendance.deletedAt)))
      .all();
  },

  findById(id: string): Attendance | undefined {
    return getDb()
      .select()
      .from(attendance)
      .where(and(eq(attendance.id, id), isNull(attendance.deletedAt)))
      .get();
  },

  findByStudentAndDate(studentId: string, date: string): Attendance | undefined {
    return getDb()
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.studentId, studentId),
          eq(attendance.date, date),
          isNull(attendance.deletedAt),
        ),
      )
      .get();
  },

  /** Insert or update a single attendance mark (unique: student + class + date). */
  upsertMark(data: NewAttendance): void {
    const existing = getDb()
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.studentId, data.studentId),
          eq(attendance.classId, data.classId),
          eq(attendance.date, data.date),
          // Regular marks only — never overwrite an extra-class row.
          isNull(attendance.extraClassId),
          isNull(attendance.deletedAt),
        ),
      )
      .get();
    if (existing) {
      const now = new Date().toISOString();
      getDb()
        .update(attendance)
        .set({
          status: data.status,
          smsIntent: data.smsIntent,
          updatedAt: now,
          clientUpdatedAt: now,
        })
        .where(eq(attendance.id, existing.id))
        .run();
    } else {
      getDb().insert(attendance).values(data).run();
    }
  },

  /** All attendance marks for one extra class. */
  findByExtraClass(extraClassId: string): Attendance[] {
    return getDb()
      .select()
      .from(attendance)
      .where(and(eq(attendance.extraClassId, extraClassId), isNull(attendance.deletedAt)))
      .all();
  },

  /** Insert or update an extra-class mark (unique: student + extra_class_id). */
  upsertExtraMark(data: NewAttendance): void {
    if (!data.extraClassId) return;
    const existing = getDb()
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.studentId, data.studentId),
          eq(attendance.extraClassId, data.extraClassId),
          isNull(attendance.deletedAt),
        ),
      )
      .get();
    if (existing) {
      const now = new Date().toISOString();
      getDb()
        .update(attendance)
        .set({ status: data.status, updatedAt: now, clientUpdatedAt: now })
        .where(eq(attendance.id, existing.id))
        .run();
    } else {
      getDb().insert(attendance).values(data).run();
    }
  },

  insert(data: NewAttendance): void {
    getDb().insert(attendance).values(data).run();
  },

  update(id: string, data: Partial<NewAttendance>): void {
    getDb()
      .update(attendance)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(attendance.id, id))
      .run();
  },

  softDelete(id: string): void {
    getDb()
      .update(attendance)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(attendance.id, id))
      .run();
  },

  // backup/restore helpers
  findAllByTeacher(teacherId: string): Attendance[] {
    return getDb()
      .select()
      .from(attendance)
      .where(eq(attendance.teacherId, teacherId))
      .all();
  },

  deleteAllByTeacher(teacherId: string): void {
    getDb().delete(attendance).where(eq(attendance.teacherId, teacherId)).run();
  },

  upsert(data: NewAttendance): void {
    getDb()
      .insert(attendance)
      .values(data)
      .onConflictDoUpdate({ target: attendance.id, set: { ...data } })
      .run();
  },
};
