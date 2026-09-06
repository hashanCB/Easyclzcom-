import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { QuestionBankItem, NewQuestionBankItem } from '../../db/schema';
import type { QuestionBankFilter } from '../../db/repositories/questionBankRepo';
import { scheduleSync } from '../sync/engine';
import { logger } from '../logger';

type Repo = typeof import('../../db/repositories/questionBankRepo').questionBankRepo;

function getRepo(): Repo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/questionBankRepo').questionBankRepo as Repo;
  } catch {
    return null;
  }
}

export function useQuestionBank(filter: QuestionBankFilter) {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);

  const key = JSON.stringify(filter);
  const refresh = useCallback(() => {
    const repo = getRepo();
    if (!repo) { setQuestions([]); setLoading(false); return; }
    try {
      setQuestions(repo.findAll(filter));
    } catch (e) {
      logger.warn('questionBankRepo.findAll failed', e);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);
  return { questions, loading, refresh, isWeb: Platform.OS === 'web' };
}

export function useQuestion(id: string | undefined) {
  const [question, setQuestion] = useState<QuestionBankItem | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!id || id === 'new') { setLoading(false); return; }
    const repo = getRepo();
    if (!repo) { setLoading(false); return; }
    try {
      setQuestion(repo.findById(id) ?? null);
    } catch (e) {
      logger.warn('useQuestion fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  return { question, loading, refresh };
}

export function saveQuestion(data: NewQuestionBankItem, id?: string): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web yet.');
  if (id && id !== 'new') repo.update(id, data);
  else repo.insert(data);
  scheduleSync();
}

export function deleteQuestion(id: string): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web yet.');
  repo.softDelete(id, new Date().toISOString());
  scheduleSync();
}
