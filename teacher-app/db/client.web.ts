export function getDb(): never {
  throw new Error('Local SQLite database is not available on web.');
}

export type Db = ReturnType<typeof getDb>;
