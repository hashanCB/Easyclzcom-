import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Exam, Mark, NewExam } from '../../db/schema';
import type { ExamFilter } from '../../db/repositories/examsRepo';
import { scheduleSync } from '../sync/engine';
import {
  computeStudentExamHistory,
  filterTrendByMonths,
  type StudentExamHistoryItem,
} from './report';
import { logger } from '../logger';

type ExamsRepo = typeof import('../../db/repositories/examsRepo').examsRepo;
type MarksRepo = typeof import('../../db/repositories/marksRepo').marksRepo;

function getRepo(): ExamsRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/examsRepo').examsRepo as ExamsRepo;
  } catch {
    return null;
  }
}

function getMarksRepo(): MarksRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/marksRepo').marksRepo as MarksRepo;
  } catch {
    return null;
  }
}

export function useExamsList(filter: ExamFilter) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const key = JSON.stringify(filter);
  const refresh = useCallback(() => {
    const repo = getRepo();
    if (!repo) {
      setExams([]);
      setLoading(false);
      return;
    }
    try {
      setExams(repo.findAll(filter));
    } catch (e) {
      logger.warn('examsRepo.findAll failed', e);
      setExams([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);
  return { exams, loading, refresh, isWeb: Platform.OS === 'web' };
}

export function useExam(id: string | undefined) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!id) { setLoading(false); return; }
    const repo = getRepo();
    if (!repo) { setLoading(false); return; }
    try {
      setExam(repo.findById(id) ?? null);
    } catch (e) {
      logger.warn('useExam fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  return { exam, loading, refresh };
}

export function saveExam(data: NewExam): void {
  const repo = getRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.insert(data);
  scheduleSync();
}

export function updateExam(id: string, data: Partial<NewExam>): void {
  const repo = getRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.update(id, data);
  scheduleSync();
}

export function deleteExam(id: string, now: string): void {
  const repo = getRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.softDelete(id, now);
  scheduleSync();
}

// Reads every exam in `classId` plus every mark for those exams, then
// composes a per-student history (newest first). Returns trends already
// sliced into 3-month and 6-month buckets for direct display.
export function useStudentExamTrend(
  studentId: string | undefined,
  classId: string | undefined,
) {
  const [history, setHistory] = useState<StudentExamHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!studentId || !classId) {
      setHistory([]);
      setLoading(false);
      return;
    }
    const examsRepo = getRepo();
    const marksRepo = getMarksRepo();
    if (!examsRepo || !marksRepo) {
      setHistory([]);
      setLoading(false);
      return;
    }
    try {
      const exams = examsRepo.findAll({ classId });
      const marksByExam = new Map<string, Mark[]>();
      for (const e of exams) marksByExam.set(e.id, marksRepo.findByExam(e.id));
      setHistory(computeStudentExamHistory(studentId, exams, marksByExam));
    } catch (e) {
      logger.warn('useStudentExamTrend failed', e);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [studentId, classId]);

  useEffect(() => { refresh(); }, [refresh]);

  const trend3m = filterTrendByMonths(history, 3);
  const trend6m = filterTrendByMonths(history, 6);
  return { history, trend3m, trend6m, loading, refresh };
}
