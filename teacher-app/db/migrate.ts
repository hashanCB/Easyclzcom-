import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrationBundle from './migrations/migrations';
import { getRawDb } from './client';

export async function runMigrations(): Promise<void> {
  // Reuse the single shared SQLite connection (see db/client.ts). Opening a
  // second handle to the same file caused `NativeDatabase.prepareSync` to be
  // rejected with a NullPointerException on production Android builds.
  const db = drizzle(getRawDb());
  await migrate(db, migrationBundle);
}
