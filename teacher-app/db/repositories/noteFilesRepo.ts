import { eq, isNull, and } from 'drizzle-orm';
import { getDb } from '../client';
import { noteFiles, type NewNoteFile, type NoteFile } from '../schema';

export const noteFilesRepo = {
  findByNote(noteId: string): NoteFile[] {
    return getDb()
      .select()
      .from(noteFiles)
      .where(and(eq(noteFiles.noteId, noteId), isNull(noteFiles.deletedAt)))
      .all();
  },

  findById(id: string): NoteFile | undefined {
    return getDb()
      .select()
      .from(noteFiles)
      .where(and(eq(noteFiles.id, id), isNull(noteFiles.deletedAt)))
      .get();
  },

  insert(data: NewNoteFile): void {
    getDb().insert(noteFiles).values(data).run();
  },

  softDelete(id: string, now: string): void {
    getDb()
      .update(noteFiles)
      .set({ deletedAt: now, updatedAt: now, clientUpdatedAt: now })
      .where(eq(noteFiles.id, id))
      .run();
  },
};
