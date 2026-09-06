'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, AlertCircle, MessagesSquare, PauseCircle } from 'lucide-react';
import { useEnrollments, markEnrollmentSuspended } from '@/lib/auth';
import { EnrollmentPicker } from '@/components/ui/EnrollmentPicker';
import { PendingPaymentBanner } from '@/components/ui/PendingPaymentBanner';
import { syncChat, type ChatMessage } from '@/lib/chat';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('default', { hour: 'numeric', minute: '2-digit' });
}

function isSuspendedError(e: unknown): boolean {
  return (e as { code?: string })?.code === 'access_suspended';
}

export default function ChatPage() {
  const enrollments           = useEnrollments();
  const [selectedIdx, setIdx] = useState(0);
  const enrollment            = enrollments[selectedIdx];
  const token                 = enrollment?.token ?? '';

  const isSuspended = enrollment?.portal_active === false;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [draft,    setDraft]    = useState('');
  const [sending,  setSending]  = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Reset + reload whenever the selected teacher changes.
  useEffect(() => {
    if (!token || isSuspended) return;
    setMessages([]); setLoading(true); setError(null);
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const state = await syncChat(token);
        if (cancelled) return;
        setMessages(state.messages);
        setLoading(false);
        pollId = setInterval(async () => {
          try {
            const s = await syncChat(token);
            if (!cancelled) setMessages(s.messages);
          } catch { /* transient */ }
        }, 3000);
      } catch (e) {
        if (cancelled) return;
        if (isSuspendedError(e) && enrollment && markEnrollmentSuspended(enrollment.student_id)) {
          window.location.reload();
          return;
        }
        setError((e as Error).message); setLoading(false);
      }
    })();

    return () => { cancelled = true; if (pollId) clearInterval(pollId); };
  }, [token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setDraft('');
    try {
      const state = await syncChat(token, text);
      setMessages(state.messages); setError(null);
    } catch (e) {
      if (isSuspendedError(e) && enrollment && markEnrollmentSuspended(enrollment.student_id)) {
        window.location.reload();
        return;
      }
      setDraft(text); setError((e as Error).message);
    } finally { setSending(false); }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 11rem)' }}>

      {/* Heading + teacher picker */}
      <div className="mb-3 space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Chat</h1>
        <EnrollmentPicker enrollments={enrollments} selectedIdx={selectedIdx} onChange={(i) => { setIdx(i); setDraft(''); }} />
        {enrollment && enrollments.length === 1 && (
          <p className="text-xs text-muted-foreground">Private conversation with {enrollment.teacher_username}</p>
        )}
        {enrollment && enrollments.length > 1 && (
          <p className="text-xs text-muted-foreground">Chatting with {enrollment.teacher_username} · {enrollment.subject}</p>
        )}
      </div>

      {enrollment?.join_status === 'pending_payment' && (
        <div className="mb-3">
          <PendingPaymentBanner teacherUsername={enrollment.teacher_username} />
        </div>
      )}

      {/* Suspended state — shown instead of messages + composer */}
      {isSuspended ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border bg-amber-50 px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <PauseCircle className="h-7 w-7 text-amber-600" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-amber-900">Chat access suspended</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Your portal access for this class has been temporarily suspended.
              You cannot send or read new messages until your teacher restores your access.
            </p>
            <p className="text-xs text-amber-600 font-medium mt-2">
              Contact {enrollment?.teacher_username ?? 'your teacher'} to restore access.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border bg-muted/30 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <MessagesSquare className="h-7 w-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No messages yet. Send a message to {enrollment?.teacher_username ?? 'your teacher'}.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.sender_role === 'student';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm ' +
                      (mine ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm border bg-card text-foreground')
                    }>
                      <p className="whitespace-pre-wrap break-words leading-snug">{m.body}</p>
                      <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-muted-foreground'}`}>
                        {fmtTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>

          {/* Composer */}
          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={`Message ${enrollment?.teacher_username ?? 'your teacher'}…`}
              rows={1}
              className="max-h-28 flex-1 resize-none rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button onClick={handleSend} disabled={sending || !draft.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition active:scale-95 disabled:opacity-40">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
