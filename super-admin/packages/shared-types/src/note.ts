import { z } from 'zod';
import { IsoDate, TenantEntity, Url, Uuid } from './common';
import { Language, NoteFileKind } from './enums';

export const NoteFields = z.object({
  title: z.string().min(1).max(200),
  topic: z.string().max(200).nullable().default(null),
  class_id: Uuid,
  grade: z.string().min(1).max(50),
  batch: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  language: Language,
  date: IsoDate,
  link_url: Url.nullable().default(null),
  remark: z.string().max(500).nullable().default(null),
  is_today_special: z.boolean().default(false),
});

export const NoteEntity = TenantEntity.merge(NoteFields);
export type NoteEntity = z.infer<typeof NoteEntity>;

export const NoteCreateInput = NoteFields;
export type NoteCreateInput = z.infer<typeof NoteCreateInput>;

export const NoteUpdateInput = NoteFields.partial();
export type NoteUpdateInput = z.infer<typeof NoteUpdateInput>;

export const NoteFileFields = z.object({
  note_id: Uuid,
  kind: NoteFileKind,
  filename: z.string().min(1).max(255),
  storage_key: z.string().min(1).max(500),
  size_bytes: z.number().int().nonnegative(),
  mime_type: z.string().max(120),
});

export const NoteFileEntity = TenantEntity.merge(NoteFileFields);
export type NoteFileEntity = z.infer<typeof NoteFileEntity>;
