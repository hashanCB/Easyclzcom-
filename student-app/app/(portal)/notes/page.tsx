'use client';

import { useEffect, useState } from 'react';
import { BookOpen, FileText, Image, Link2, Layers, Calendar, Download, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EnrollmentPicker } from '@/components/ui/EnrollmentPicker';
import { SuspendedBanner } from '@/components/ui/SuspendedBanner';
import { PendingPaymentBanner } from '@/components/ui/PendingPaymentBanner';
import { useEnrollments, markEnrollmentSuspended } from '@/lib/auth';
import { fetchStudentNotes, fetchFileDownloadUrl, type StudentNote, type NoteFile } from '@/lib/notes';

function isSuspendedError(e: unknown): boolean {
  return (e as { code?: string })?.code === 'access_suspended';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_CONFIG = {
  normal: { label: 'Note',     variant: 'default' as const, Icon: FileText },
  topic:  { label: 'Topic',    variant: 'default' as const, Icon: Layers   },
  today:  { label: "Today's",  variant: 'success' as const, Icon: Calendar  },
  link:   { label: 'Link',     variant: 'default' as const, Icon: Link2     },
} as const;

const MIME_ICONS: Record<string, typeof FileText> = {
  'application/pdf': FileText,
  'image/jpeg': Image, 'image/png': Image, 'image/webp': Image,
};

function FileRow({ file, token }: { file: NoteFile; token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const Icon = MIME_ICONS[file.mime_type] ?? FileText;

  async function handleDownload() {
    setLoading(true); setError(null);
    try {
      const url = await fetchFileDownloadUrl(file.r2_key, token);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.filename}</p>
        {formatSize(file.size_bytes) && <p className="text-xs text-muted-foreground">{formatSize(file.size_bytes)}</p>}
        {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
      </div>
      <button onClick={handleDownload} disabled={loading}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-60">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function NoteCard({ note, token }: { note: StudentNote; token: string }) {
  const cfg = TYPE_CONFIG[note.note_type] ?? TYPE_CONFIG.normal;
  return (
    <Card>
      <CardBody className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <cfg.Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight">{note.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              {note.topic && <span className="text-xs text-muted-foreground">{note.topic}</span>}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{formatDate(note.note_date)}</span>
        </div>
        {note.remark && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{note.remark}</p>
        )}
        {note.note_type === 'link' && note.link_url && (
          <a href={note.link_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-primary transition hover:bg-primary/10">
            <Link2 className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{note.link_url}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        )}
        {note.files.length > 0 && (
          <div className="space-y-2">
            {note.files.map((f) => <FileRow key={f.id} file={f} token={token} />)}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const FILTERS = [
  { key: 'all'   as const, label: 'All' },
  { key: 'today' as const, label: "Today's" },
  { key: 'topic' as const, label: 'By Topic' },
  { key: 'link'  as const, label: 'Links' },
];

export default function NotesPage() {
  const enrollments              = useEnrollments();
  const [selectedIdx, setIdx]    = useState(0);
  const enrollment               = enrollments[selectedIdx];
  const token                    = enrollment?.token ?? '';

  const [notes,   setNotes]      = useState<StudentNote[]>([]);
  const [loading, setLoading]    = useState(true);
  const [error,   setError]      = useState<string | null>(null);
  const [filter,  setFilter]     = useState<'all' | 'today' | 'topic' | 'link'>('all');

  useEffect(() => {
    if (!token || enrollment?.portal_active === false) return;
    setLoading(true); setNotes([]); setError(null);
    fetchStudentNotes(token)
      .then(setNotes)
      .catch((e) => {
        if (isSuspendedError(e) && enrollment && markEnrollmentSuspended(enrollment.student_id)) {
          window.location.reload();
          return;
        }
        setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [token, enrollment?.portal_active]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const filtered = notes.filter((n) => {
    if (filter === 'today') return n.note_date === todayISO || n.note_type === 'today';
    if (filter === 'topic') return n.note_type === 'topic';
    if (filter === 'link')  return n.note_type === 'link';
    return true;
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Note Library</h1>

      <EnrollmentPicker enrollments={enrollments} selectedIdx={selectedIdx} onChange={setIdx} />

      {enrollment?.portal_active === false ? (
        <SuspendedBanner teacherUsername={enrollment.teacher_username} fullBlock />
      ) : (<>

      {enrollment?.join_status === 'pending_payment' && (
        <PendingPaymentBanner teacherUsername={enrollment.teacher_username} />
      )}

      {/* Teacher context label (single enrollment) */}
      {enrollment && enrollments.length === 1 && (
        <p className="text-xs text-muted-foreground">
          {enrollment.subject} · {enrollment.teacher_username}
        </p>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition active:scale-95 ${
              filter === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm">Loading notes…</p>
        </div>
      )}
      {!loading && error && (
        <Card><CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm font-medium text-red-600">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); fetchStudentNotes(token).then(setNotes).catch((e) => setError((e as Error).message)).finally(() => setLoading(false)); }}
            className="rounded-lg border px-4 py-2 text-xs font-semibold transition hover:bg-muted">Retry</button>
        </CardBody></Card>
      )}
      {!loading && !error && filtered.length === 0 && (
        <Card><CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-semibold">No notes yet</p>
          <p className="text-sm text-muted-foreground">
            {filter === 'all'
              ? `${enrollment?.teacher_username ?? 'Your teacher'} hasn't uploaded any notes yet.`
              : `No ${filter === 'today' ? "today's" : filter} notes found.`}
          </p>
        </CardBody></Card>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{filtered.length} note{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.map((note) => <NoteCard key={note.id} note={note} token={token} />)}
        </div>
      )}

      </>)}
    </div>
  );
}
