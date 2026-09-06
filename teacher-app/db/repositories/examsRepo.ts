import { eq, isNull, and, desc } from 'drizzle-orm';
import { getDb } from '../client';
import { exams, type NewExam, type Exam } from '../schema';

export interface ExamFilter {
  teacherId?: string;
  classId?: string;
}

export const examsRepo = {
  findAll(filter: ExamFilter = {}): Exam[] {
    const conds = [isNull(exams.deletedAt)];
    if (filter.teacherId) conds.push(eq(exams.teacherId, filter.teacherId));
    if (filter.classId) conds.push(eq(exams.classId, filter.classId));
    return getDb()
      .select()
      .from(exams)
      .where(and(...conds))
      .orderBy(desc(exams.examDate), desc(exams.createdAt))
      .all();
  },

  findById(id: string): Exam | undefined {
    return getDb()
      .select()
      .from(exams)
      .where(and(eq(exams.id, id), isNull(exams.deletedAt)))
      .get();
  },

  insert(data: NewExam): void {
    getDb().insert(exams).values(data).run();
  },

  update(id: string, data: Partial<NewExam>): void {
    const now = new Date().toISOString();
    getDb().update(exams).set({ ...data, updatedAt: now, clientUpdatedAt: now }).where(eq(exams.id, id)).run();
  },

  softDelete(id: string, now: string): void {
    getDb().update(exams).set({ deletedAt: now, updatedAt: now, clientUpdatedAt: now }).where(eq(exams.id, id)).run();
  },
};
