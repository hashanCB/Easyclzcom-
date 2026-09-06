import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { marks, type Mark, type NewMark } from '../schema';

export const marksRepo = {
  findByExam(examId: string): Mark[] {
    return getDb()
      .select()
      .from(marks)
      .where(and(eq(marks.examId, examId), isNull(marks.deletedAt)))
      .all();
  },

  findOne(examId: string, studentId: string): Mark | undefined {
    return getDb()
      .select()
      .from(marks)
      .where(
        and(eq(marks.examId, examId), eq(marks.studentId, studentId), isNull(marks.deletedAt)),
      )
      .get();
  },

  // Insert or update the single mark row for an (exam, student) pair.
  upsert(row: NewMark): void {
    const db = getDb();
    const existing = this.findOne(row.examId, row.studentId);
    if (existing) {
      db.update(marks)
        .set({
          mark: row.mark,
          remark: row.remark ?? null,
          updatedAt: row.updatedAt,
          clientUpdatedAt: row.clientUpdatedAt,
          deletedAt: null,
        })
        .where(eq(marks.id, existing.id))
        .run();
    } else {
      db.insert(marks).values(row).run();
    }
  },

  remove(examId: string, studentId: string, now: string): void {
    const db = getDb();
    const existing = this.findOne(examId, studentId);
    if (existing) {
      db.update(marks)
        .set({ deletedAt: now, updatedAt: now, clientUpdatedAt: now })
        .where(eq(marks.id, existing.id))
        .run();
    }
  },
};
