import { eq, isNull, and, desc } from 'drizzle-orm';
import { getDb } from '../client';
import { questionBank, type NewQuestionBankItem, type QuestionBankItem } from '../schema';

export interface QuestionBankFilter {
  teacherId?: string;
  classId?: string;
}

export const questionBankRepo = {
  findAll(filter: QuestionBankFilter = {}): QuestionBankItem[] {
    const conds = [isNull(questionBank.deletedAt)];
    if (filter.teacherId) conds.push(eq(questionBank.teacherId, filter.teacherId));
    if (filter.classId) conds.push(eq(questionBank.classId, filter.classId));
    return getDb()
      .select()
      .from(questionBank)
      .where(and(...conds))
      .orderBy(desc(questionBank.createdAt))
      .all();
  },

  findById(id: string): QuestionBankItem | undefined {
    return getDb()
      .select()
      .from(questionBank)
      .where(and(eq(questionBank.id, id), isNull(questionBank.deletedAt)))
      .get();
  },

  /** Count of live questions in a class — used to cap how many an exam can use. */
  countInClass(classId: string): number {
    return this.findAll({ classId }).length;
  },

  insert(data: NewQuestionBankItem): void {
    getDb().insert(questionBank).values(data).run();
  },

  update(id: string, data: Partial<NewQuestionBankItem>): void {
    const now = new Date().toISOString();
    getDb()
      .update(questionBank)
      .set({ ...data, updatedAt: now, clientUpdatedAt: now })
      .where(eq(questionBank.id, id))
      .run();
  },

  softDelete(id: string, now: string): void {
    getDb()
      .update(questionBank)
      .set({ deletedAt: now, updatedAt: now, clientUpdatedAt: now })
      .where(eq(questionBank.id, id))
      .run();
  },

  // backup/restore helpers
  findAllByTeacher(teacherId: string): QuestionBankItem[] {
    return getDb().select().from(questionBank).where(eq(questionBank.teacherId, teacherId)).all();
  },

  deleteAllByTeacher(teacherId: string): void {
    getDb().delete(questionBank).where(eq(questionBank.teacherId, teacherId)).run();
  },

  upsert(data: NewQuestionBankItem): void {
    getDb()
      .insert(questionBank)
      .values(data)
      .onConflictDoUpdate({ target: questionBank.id, set: { ...data } })
      .run();
  },
};
