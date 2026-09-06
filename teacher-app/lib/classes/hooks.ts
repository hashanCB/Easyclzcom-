import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Class, NewClass } from '../../db/schema/classes';
import { useAuthStore } from '../auth/store';
import { scheduleSync } from '../sync/engine';
import { logger } from '../logger';

type Repo = typeof import('../../db/repositories/classesRepo').classesRepo;

function getRepo(): Repo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/classesRepo').classesRepo as Repo;
  } catch {
    return null;
  }
}

export function useClassesList() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const teacherId = useAuthStore((s) => s.teacher?.id ?? '');

  const refresh = useCallback(() => {
    const repo = getRepo();
    if (!repo || !teacherId) {
      setClasses([]);
      setLoading(false);
      return;
    }
    try {
      setClasses(repo.findAll(teacherId));
    } catch (e) {
      logger.warn('classes.findAll failed', e);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { classes, loading, refresh, isWeb: Platform.OS === 'web' };
}

export function useClass(id: string | undefined) {
  const [cls, setCls] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || id === 'new') {
      setCls(null);
      setLoading(false);
      return;
    }
    const repo = getRepo();
    if (!repo) {
      setLoading(false);
      return;
    }
    try {
      setCls(repo.findById(id) ?? null);
    } catch (e) {
      logger.warn('classes.findById failed', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  return { cls, loading };
}

export function saveClass(data: NewClass, id?: string): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web yet.');
  if (id && id !== 'new') {
    repo.update(id, data);
  } else {
    repo.insert(data);
  }
  scheduleSync();
}

export function deactivateClass(id: string): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web yet.');
  repo.update(id, { isActive: false });
  scheduleSync();
}

export function activateClass(id: string): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web yet.');
  repo.update(id, { isActive: true });
  scheduleSync();
}
