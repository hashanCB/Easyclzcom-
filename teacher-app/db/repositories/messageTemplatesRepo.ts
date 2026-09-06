import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { messageTemplates, type MessageTemplate, type NewMessageTemplate } from '../schema';

export const messageTemplatesRepo = {
  async findAll(teacherId: string): Promise<MessageTemplate[]> {
    const db = getDb();
    return db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.teacherId, teacherId), isNull(messageTemplates.deletedAt)))
      .all();
  },

  async findById(id: string): Promise<MessageTemplate | null> {
    const db = getDb();
    const rows = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).limit(1).all();
    return rows[0] ?? null;
  },

  async findDefaultForType(teacherId: string, type: string, language: string): Promise<MessageTemplate | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.teacherId, teacherId),
          eq(messageTemplates.type, type),
          eq(messageTemplates.language, language),
          eq(messageTemplates.isDefault, true),
          isNull(messageTemplates.deletedAt),
        ),
      )
      .limit(1)
      .all();
    return rows[0] ?? null;
  },

  async insert(row: NewMessageTemplate): Promise<void> {
    const db = getDb();
    await db.insert(messageTemplates).values(row);
  },

  async update(id: string, patch: Partial<Pick<MessageTemplate, 'type' | 'language' | 'body' | 'isDefault' | 'updatedAt' | 'clientUpdatedAt'>>): Promise<void> {
    const db = getDb();
    await db.update(messageTemplates).set(patch).where(eq(messageTemplates.id, id));
  },

  async clearDefault(teacherId: string, type: string, language: string): Promise<void> {
    const db = getDb();
    await db
      .update(messageTemplates)
      .set({ isDefault: false })
      .where(
        and(
          eq(messageTemplates.teacherId, teacherId),
          eq(messageTemplates.type, type),
          eq(messageTemplates.language, language),
          isNull(messageTemplates.deletedAt),
        ),
      );
  },

  async softDelete(id: string, now: string): Promise<void> {
    const db = getDb();
    await db
      .update(messageTemplates)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(messageTemplates.id, id));
  },
};
