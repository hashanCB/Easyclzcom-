import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Note, NewNote, NoteFile, NewNoteFile } from '../../db/schema';
import type { NoteFilter } from '../../db/repositories/notesRepo';
import { scheduleSync } from '../sync/engine';
import { logger } from '../logger';

type NotesRepo = typeof import('../../db/repositories/notesRepo').notesRepo;
type NoteFilesRepo = typeof import('../../db/repositories/noteFilesRepo').noteFilesRepo;

function getNotesRepo(): NotesRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/notesRepo').notesRepo as NotesRepo;
  } catch {
    return null;
  }
}

function getNoteFilesRepo(): NoteFilesRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/noteFilesRepo').noteFilesRepo as NoteFilesRepo;
  } catch {
    return null;
  }
}

export function useNotesList(filter: NoteFilter) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const key = JSON.stringify(filter);
  const refresh = useCallback(() => {
    const repo = getNotesRepo();
    if (!repo) {
      setNotes([]);
      setLoading(false);
      return;
    }
    try {
      setNotes(repo.findAll(filter));
    } catch (e) {
      logger.warn('notesRepo.findAll failed', e);
      setNotes([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);
  return { notes, loading, refresh, isWeb: Platform.OS === 'web' };
}

export function useNote(id: string | undefined) {
  const [note, setNote] = useState<Note | null>(null);
  const [files, setFiles] = useState<NoteFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!id) { setLoading(false); return; }
    const notesRepo = getNotesRepo();
    const filesRepo = getNoteFilesRepo();
    if (!notesRepo || !filesRepo) { setLoading(false); return; }
    try {
      setNote(notesRepo.findById(id) ?? null);
      setFiles(filesRepo.findByNote(id));
    } catch (e) {
      logger.warn('useNote fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  return { note, files, loading, refresh };
}

export function saveNote(data: NewNote): void {
  const repo = getNotesRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.insert(data);
  scheduleSync();
}

export function updateNote(id: string, data: Partial<NewNote>): void {
  const repo = getNotesRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.update(id, data);
  scheduleSync();
}

export function deleteNote(id: string, now: string): void {
  const repo = getNotesRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.softDelete(id, now);
  scheduleSync();
}

export function saveNoteFile(data: NewNoteFile): void {
  const repo = getNoteFilesRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.insert(data);
  scheduleSync();
}

export function deleteNoteFile(id: string, now: string): void {
  const repo = getNoteFilesRepo();
  if (!repo) throw new Error('DB not available on web');
  repo.softDelete(id, now);
  scheduleSync();
}

export function getNoteFileById(id: string): NoteFile | null {
  const repo = getNoteFilesRepo();
  if (!repo) return null;
  return repo.findById(id) ?? null;
}
