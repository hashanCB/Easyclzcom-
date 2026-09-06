import { eq, isNull, and, desc } from 'drizzle-orm';
import { getDb } from '../client';
import { notes, type NewNote, type Note } from '../schema';

export interface NoteFilter {
  teacherId?: string;
  classId?: string;
}

export const notesRepo = {
  findAll(filter: NoteFilter = {}): Note[] {
    const conds = [isNull(notes.deletedAt)];
    if (filter.teacherId) conds.push(eq(notes.teacherId, filter.teacherId));
    if (filter.classId) conds.push(eq(notes.classId, filter.classId));
    return getDb()
      .select()
      .from(notes)
      .where(and(...conds))
      .orderBy(desc(notes.noteDate), desc(notes.createdAt))
      .all();
  },

  findById(id: string): Note | undefined {
    return getDb()
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
      .get();
  },

  insert(data: NewNote): void {
    getDb().insert(notes).values(data).run();
  },

  update(id: string, data: Partial<NewNote>): void {
    const now = new Date().toISOString();
    getDb().update(notes).set({ ...data, updatedAt: now, clientUpdatedAt: now }).where(eq(notes.id, id)).run();
  },

  softDelete(id: string, now: string): void {
    getDb().update(notes).set({ deletedAt: now, updatedAt: now, clientUpdatedAt: now }).where(eq(notes.id, id)).run();
  },
};
