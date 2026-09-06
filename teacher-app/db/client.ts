import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

// v3 = bumped during U24 sync hookup. The pre-v3 local schema had column-name
// mismatches with the cloud (parent_phone vs parent_mobile, photo_url vs
// profile_photo_url, non-UUID ids) that caused 400s on push. v3 starts from a
// clean DB with a single baseline migration that matches the cloud schema.
export const DB_NAME = 'teacher_local_v3.db';

// A single native SQLite handle is shared across the whole app. Opening the
// same database file with `openDatabaseSync` more than once creates multiple
// native connections, which under the New Architecture (Expo SDK 54) leads to
// `NativeDatabase.prepareSync ... NullPointerException`. Both the migrator and
// the repositories must go through this one connection.
let _sqlite: SQLite.SQLiteDatabase | null = null;

export function getRawDb(): SQLite.SQLiteDatabase {
  if (!_sqlite) {
    _sqlite = SQLite.openDatabaseSync(DB_NAME);
  }
  return _sqlite;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    _db = drizzle(getRawDb(), { schema });
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;
