import { eq, isNull, and } from 'drizzle-orm';
import { getDb } from '../client';
import { classes, type NewClass, type Class } from '../schema';

export const classesRepo = {
  findAll(teacherId: string): Class[] {
    return getDb()
      .select()
      .from(classes)
      .where(and(eq(classes.teacherId, teacherId), isNull(classes.deletedAt)))
      .all();
  },

  findById(id: string): Class | undefined {
    return getDb()
      .select()
      .from(classes)
      .where(and(eq(classes.id, id), isNull(classes.deletedAt)))
      .get();
  },

  findActive(teacherId: string): Class[] {
    return getDb()
      .select()
      .from(classes)
      .where(and(eq(classes.teacherId, teacherId), eq(classes.isActive, true), isNull(classes.deletedAt)))
      .all();
  },

  insert(data: NewClass): void {
    getDb().insert(classes).values(data).run();
  },

  update(id: string, data: Partial<NewClass>): void {
    const now = new Date().toISOString();
    getDb()
      .update(classes)
      // clientUpdatedAt must always bump so the sync push picks up the change.
      .set({ ...data, updatedAt: now, clientUpdatedAt: now })
      .where(eq(classes.id, id))
      .run();
  },

  softDelete(id: string): void {
    const now = new Date().toISOString();
    getDb()
      .update(classes)
      .set({ deletedAt: now, updatedAt: now, clientUpdatedAt: now })
      .where(eq(classes.id, id))
      .run();
  },

  // backup/restore helpers
  deleteAllByTeacher(teacherId: string): void {
    getDb().delete(classes).where(eq(classes.teacherId, teacherId)).run();
  },

  upsert(data: NewClass): void {
    getDb()
      .insert(classes)
      .values(data)
      .onConflictDoUpdate({ target: classes.id, set: { ...data } })
      .run();
  },
};
