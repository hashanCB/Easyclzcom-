const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\s/g, '');

export interface NoteFile {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  r2_key: string;
}

export interface StudentNote {
  id: string;
  title: string;
  topic: string | null;
  note_type: 'normal' | 'topic' | 'today' | 'link';
  note_date: string;
  link_url: string | null;
  remark: string | null;
  files: NoteFile[];
}

export async function fetchStudentNotes(token: string): Promise<StudentNote[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get_student_notes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    const e = new Error(data?.error?.message ?? 'Failed to load notes');
    (e as Error & { code?: string }).code = data?.error?.code;
    throw e;
  }
  return data.notes as StudentNote[];
}

export async function fetchFileDownloadUrl(r2Key: string, token: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get_student_file_url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ r2_key: r2Key }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to get download URL');
  return data.url as string;
}
