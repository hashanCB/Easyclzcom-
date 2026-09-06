import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable('notes', {
  id:             text('id').primaryKey(),
  teacherId:      text('teacher_id').notNull(),
  classId:        text('class_id').notNull(),
  title:          text('title').notNull(),
  topic:          text('topic'),
  grade:          text('grade'),
  batch:          text('batch'),
  subject:        text('subject'),
  language:       text('language'),
  noteDate:       text('note_date').notNull(),       // ISO date YYYY-MM-DD
  noteType:       text('note_type').notNull().default('normal'), // 'normal'|'topic'|'today'|'link'
  linkUrl:        text('link_url'),
  remark:         text('remark'),
  deletedAt:      text('deleted_at'),
  createdAt:      text('created_at').notNull(),
  updatedAt:      text('updated_at').notNull(),
  clientUpdatedAt: text('client_updated_at'),
  syncedAt:       text('synced_at'),
});

export const noteFiles = sqliteTable('note_files', {
  id:              text('id').primaryKey(),
  noteId:          text('note_id').notNull(),
  teacherId:       text('teacher_id').notNull(),
  filename:        text('filename').notNull(),
  mimeType:        text('mime_type').notNull(),
  sizeBytes:       integer('size_bytes'),
  r2Key:           text('r2_key').notNull(),
  deletedAt:       text('deleted_at'),
  createdAt:       text('created_at').notNull(),
  updatedAt:       text('updated_at').notNull(),
  clientUpdatedAt: text('client_updated_at'),
  syncedAt:        text('synced_at'),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type NoteFile = typeof noteFiles.$inferSelect;
export type NewNoteFile = typeof noteFiles.$inferInsert;
