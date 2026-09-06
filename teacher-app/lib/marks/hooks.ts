import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Mark, NewMark } from '../../db/schema';
import { scheduleSync } from '../sync/engine';
import { logger } from '../logger';

type MarksRepo = typeof import('../../db/repositories/marksRepo').marksRepo;

function getRepo(): MarksRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/marksRepo').marksRepo as MarksRepo;
  } catch {
    return null;
  }
}

// Returns a map of studentId -> Mark for an exam.
export function useExamMarks(examId: string | undefined) {
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!examId) { setLoading(false); return; }
    const repo = getRepo();
    if (!repo) { setLoading(false); return; }
    try {
      const rows = repo.findByExam(examId);
      setMarks(new Map(rows.map((r) => [r.studentId, r])));
    } catch (e) {
      logger.warn('marksRepo.findByExam failed', e);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { marks, loading, refresh };
}

export function upsertMark(row: NewMark): void {
  const repo = getRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.upsert(row);
  scheduleSync();
}

export function removeMark(examId: string, studentId: string, now: string): void {
  const repo = getRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.remove(examId, studentId, now);
  scheduleSync();
}
