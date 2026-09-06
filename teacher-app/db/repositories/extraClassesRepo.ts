import { eq, isNull, and, desc } from 'drizzle-orm';
import { getDb } from '../client';
import { extraClasses, type NewExtraClass, type ExtraClass } from '../schema';

export interface ExtraClassFilter {
  teacherId?: string;
  classId?: string;
}

export const extraClassesRepo = {
  findAll(filter: ExtraClassFilter = {}): ExtraClass[] {
    const conds = [isNull(extraClasses.deletedAt)];
    if (filter.teacherId) conds.push(eq(extraClasses.teacherId, filter.teacherId));
    if (filter.classId) conds.push(eq(extraClasses.classId, filter.classId));
    return getDb()
      .select()
      .from(extraClasses)
      .where(and(...conds))
      .orderBy(desc(extraClasses.date), desc(extraClasses.createdAt))
      .all();
  },

  findById(id: string): ExtraClass | undefined {
    return getDb()
      .select()
      .from(extraClasses)
      .where(and(eq(extraClasses.id, id), isNull(extraClasses.deletedAt)))
      .get();
  },

  insert(data: NewExtraClass): void {
    getDb().insert(extraClasses).values(data).run();
  },

  update(id: string, data: Partial<NewExtraClass>): void {
    const now = new Date().toISOString();
    getDb().update(extraClasses).set({ ...data, updatedAt: now, clientUpdatedAt: now }).where(eq(extraClasses.id, id)).run();
  },

  softDelete(id: string, now: string): void {
    getDb().update(extraClasses).set({ deletedAt: now, updatedAt: now, clientUpdatedAt: now }).where(eq(extraClasses.id, id)).run();
  },

  // backup/restore helpers
  findAllByTeacher(teacherId: string): ExtraClass[] {
    return getDb().select().from(extraClasses).where(eq(extraClasses.teacherId, teacherId)).all();
  },
  deleteAllByTeacher(teacherId: string): void {
    getDb().delete(extraClasses).where(eq(extraClasses.teacherId, teacherId)).run();
  },
  upsert(data: NewExtraClass): void {
    getDb().insert(extraClasses).values(data).onConflictDoUpdate({ target: extraClasses.id, set: { ...data } }).run();
  },
};
