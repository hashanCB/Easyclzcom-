import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

// ─── Assistant per-class cash summary cache ─────────────────────────────────
//
// The class summary shows how much cash the assistant collected today, split
// into "waiting for teacher" (pending) and "confirmed". Those totals live on the
// server (payment_collections), so we cache the last fetched figures per class
// to a tiny JSON file — the summary then still shows at a dead-signal doorway,
// updating when back online. Keyed by class + date so yesterday's totals never
// leak into today. Mirrors classCache / the working-set pattern.

export interface CashSummary {
  date: string;            // YYYY-MM-DD the totals describe
  pendingCents: number;
  pendingCount: number;
  confirmedCents: number;
  confirmedCount: number;
}

const FILE_NAME = 'assistant_cash_summary.json';

function cacheFile(): File {
  return new File(Paths.document, FILE_NAME);
}

function readAll(): Record<string, CashSummary> {
  if (Platform.OS === 'web') return {};
  try {
    const f = cacheFile();
    if (!f.exists) return {};
    const obj = JSON.parse(f.textSync());
    return obj && typeof obj === 'object' ? (obj as Record<string, CashSummary>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, CashSummary>): void {
  if (Platform.OS === 'web') return;
  try {
    cacheFile().write(JSON.stringify(map));
  } catch {
    try {
      const f = cacheFile();
      f.create({ intermediates: true, overwrite: true });
      f.write(JSON.stringify(map));
    } catch {
      /* give up silently — summary will just show zeros offline */
    }
  }
}

export function readCashSummary(classId: string): CashSummary | null {
  return readAll()[classId] ?? null;
}

export function writeCashSummary(classId: string, summary: CashSummary): void {
  const all = readAll();
  all[classId] = summary;
  writeAll(all);
}
