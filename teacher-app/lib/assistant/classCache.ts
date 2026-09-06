import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

// ─── Assistant class metadata cache ─────────────────────────────────────────
//
// The add-student form needs each class's grade/batch/subject/language to
// auto-fill the (NOT NULL) student fields. The assistant home screen fetches
// these while online; we cache them to a small JSON file so a teacher can still
// register a student at a dead-signal doorway. Mirrors the working-set pattern.

export interface CachedClass {
  id: string;
  grade: string;
  batch: string;
  subject: string;
  language: string;
}

const FILE_NAME = 'assistant_classes.json';

function cacheFile(): File {
  return new File(Paths.document, FILE_NAME);
}

export function readCachedClasses(): CachedClass[] {
  if (Platform.OS === 'web') return [];
  try {
    const f = cacheFile();
    if (!f.exists) return [];
    const arr = JSON.parse(f.textSync());
    return Array.isArray(arr) ? (arr as CachedClass[]) : [];
  } catch {
    return [];
  }
}

export function writeCachedClasses(rows: CachedClass[]): void {
  if (Platform.OS === 'web') return;
  try {
    cacheFile().write(JSON.stringify(rows));
  } catch {
    try {
      const f = cacheFile();
      f.create({ intermediates: true, overwrite: true });
      f.write(JSON.stringify(rows));
    } catch {
      /* give up silently — the add form will just show no cached classes */
    }
  }
}
