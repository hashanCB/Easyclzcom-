import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { logger } from '../logger';

// ─── Assistant store-and-forward outbox ─────────────────────────────────────
//
// Assistants scan student cards at the door — often a spot with no signal. If
// every "mark present" / "collect payment" went straight to the cloud, a dead
// zone would block the whole queue of students. Instead we save each write to a
// local JSON file first (durable across app restarts) and replay it to Supabase
// the moment connectivity returns. The teacher's roster keeps moving; the phone
// catches up in the background.
//
// Why a file and not SecureStore: a busy session can queue dozens of rows, well
// past SecureStore's ~2KB-per-item ceiling. expo-file-system has no such limit.
//
// Why replays are safe: every queued row carries the UUID it was created with
// and we replay with `resolution=merge-duplicates`, so re-sending is an
// idempotent upsert. Payments upsert on their primary-key id; attendance
// upserts on its natural key (student, class, day) so a corrected status wins
// instead of colliding with the unique index. No duplicate payments, no double
// marks — even if the app died mid-flush and we retry the same item next launch.

export type OutboxKind = 'attendance' | 'payment' | 'student';

// Per-kind replay strategy. The two tables have *different* assistant RLS:
//
//   • attendance: assistants may INSERT *and* UPDATE. A re-mark (present→absent)
//     should win, so we upsert on the natural key with merge-duplicates.
//   • payments:   assistants may INSERT only — there is no UPDATE policy. So a
//     retry must never become an UPDATE. We do a plain insert; if the row
//     already landed on a prior attempt the duplicate primary key returns 409,
//     which we treat as success. Using merge-duplicates here would turn that
//     retry into an UPDATE and RLS would reject it *forever* — the original bug
//     where a paid student's write stayed stuck in the queue.
const ATTENDANCE_PREFER = 'resolution=merge-duplicates,return=minimal';
const PAYMENT_PREFER = 'return=minimal';

export interface OutboxEntry {
  /** Local queue id (not the row id) — used to dedupe within the queue. */
  id: string;
  kind: OutboxKind;
  /** Exact REST body to replay: a row object or an array of row objects. */
  body: unknown;
  /** ISO time the write was made on this device (for display / ordering). */
  createdAt: string;
  /** Times the *server* has hard-rejected this row (not network errors). */
  attempts?: number;
  /** The server's reason for the most recent rejection (for the queue UI). */
  lastError?: string;
}

const FILE_NAME = 'assistant_outbox.json';

// A row the server keeps rejecting (malformed, FK gone, RLS) must not wedge the
// queue forever and block every later row behind it. After this many hard
// rejections we stop *retrying* it — but we never delete it. The row stays in
// the queue, flagged "Failed" with the server's reason, so the assistant can
// see something needs attention instead of the write vanishing silently.
const MAX_REJECTIONS = 5;

/** A row that has exhausted its retries — kept, shown as failed, not re-sent. */
export function isFailed(entry: OutboxEntry): boolean {
  return (entry.attempts ?? 0) >= MAX_REJECTIONS;
}

// Attendance has a natural key — one row per (student, class, day). Replaying a
// re-mark with a fresh id would collide with that unique index and 409, silently
// dropping a real correction. Upserting on the key lets the new status win.
const ATTENDANCE_ON_CONFLICT = 'student_id,class_id,date,extra_class_id';

function outboxFile(): File {
  return new File(Paths.document, FILE_NAME);
}

function readFromDisk(): OutboxEntry[] {
  if (Platform.OS === 'web') return [];
  try {
    const file = outboxFile();
    if (!file.exists) return [];
    const arr = JSON.parse(file.textSync());
    return Array.isArray(arr) ? (arr as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function writeToDisk(items: OutboxEntry[]): void {
  if (Platform.OS === 'web') return;
  try {
    outboxFile().write(JSON.stringify(items));
  } catch {
    // Last-ditch: the file may not exist yet — create then retry once.
    try {
      const file = outboxFile();
      file.create({ intermediates: true, overwrite: true });
      file.write(JSON.stringify(items));
    } catch {
      /* give up silently — the in-memory queue still holds the data */
    }
  }
}

interface OutboxState {
  items: OutboxEntry[];
  flushing: boolean;
  /** Load any queued writes left over from a previous session / app launch. */
  hydrate: () => void;
  /** Persist a write locally. Returns immediately — the UI need not wait. */
  enqueue: (kind: OutboxKind, body: unknown) => void;
  /**
   * Permanently remove one queued entry. Used by the queue UI to let an
   * assistant clear a write the server will never accept (e.g. a payment on a
   * class they've lost permission for) after showing it to their teacher.
   */
  remove: (entryId: string) => void;
  /**
   * Try to upload everything queued. No-op while already flushing or when the
   * queue is empty. Stops at the first network failure (we're offline) and
   * keeps the rest for the next attempt. A row the server hard-rejects is
   * retried a few times then left in place flagged "Failed" (never dropped, so
   * no write is lost). Returns how many uploaded.
   */
  flush: (token: string) => Promise<number>;
}

export const useOutboxStore = create<OutboxState>((set, get) => ({
  items: [],
  flushing: false,

  hydrate: () => {
    set({ items: readFromDisk() });
  },

  enqueue: (kind, body) => {
    const entry: OutboxEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      body,
      createdAt: new Date().toISOString(),
    };
    const items = [...get().items, entry];
    writeToDisk(items);
    set({ items });
  },

  remove: (entryId) => {
    const items = get().items.filter((i) => i.id !== entryId);
    writeToDisk(items);
    set({ items });
  },

  flush: async (token) => {
    if (get().flushing) return 0;
    const pending = get().items;
    if (pending.length === 0 || !token) return 0;

    set({ flushing: true });
    let uploaded = 0;
    // Rows we couldn't clear this pass and must keep for next time: everything
    // from the point we go offline, plus rejected-but-not-yet-exhausted rows.
    const kept: OutboxEntry[] = [];
    let offline = false;
    try {
      // Process oldest-first so attendance/payments land in the order they
      // happened.
      for (const entry of pending) {
        // Once we hit the network wall every later row stays queued untouched.
        if (offline) {
          kept.push(entry);
          continue;
        }

        // A row that already exhausted its retries: keep it (so it stays
        // visible as "Failed") but don't hammer the server with it every flush.
        if (isFailed(entry)) {
          kept.push(entry);
          continue;
        }

        // Attendance upserts on its natural key so re-marks don't 409; payments
        // and student inserts do a plain insert and lean on 409-as-success for
        // replays (idempotent on the row's primary-key id — see the PREFER
        // constants above for why the headers differ). Assistants have INSERT-only
        // RLS on both payments and students, so a retry must never become UPDATE.
        let url: string;
        let prefer: string;
        if (entry.kind === 'attendance') {
          url = `${SUPABASE_URL}/rest/v1/attendance?on_conflict=${ATTENDANCE_ON_CONFLICT}`;
          prefer = ATTENDANCE_PREFER;
        } else if (entry.kind === 'student') {
          // Assistant student adds go STRAIGHT to the live roster — no teacher
          // review. RLS (students_assistant_insert) permits it for assistants
          // with can_add_student, and a DB trigger assigns the STU-#### code.
          // Insert-only like payments: a replay 409s on the duplicate id, which
          // we treat as success (never an UPDATE — assistants have no UPDATE RLS).
          url = `${SUPABASE_URL}/rest/v1/students`;
          prefer = PAYMENT_PREFER;
        } else {
          // Cash collections go to the handover queue, not the live books — the
          // teacher confirms each one (which creates the real payments row).
          url = `${SUPABASE_URL}/rest/v1/payment_collections`;
          prefer = PAYMENT_PREFER;
        }

        let outcome: 'ok' | 'reject' | 'offline';
        let rejectReason = '';
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Prefer: prefer,
            },
            body: JSON.stringify(entry.body),
          });
          // 2xx = accepted. 409 means the row already exists — a prior attempt
          // actually landed, so treat it as done. Any other non-2xx is the
          // server rejecting *this* row; it won't fix itself on a blind retry.
          if (res.ok || res.status === 409) {
            outcome = 'ok';
          } else {
            outcome = 'reject';
            // Capture PostgREST's reason so the queue UI can explain the failure
            // instead of just spinning forever. Read defensively — the body may
            // be empty or non-JSON.
            let detail = '';
            try {
              const text = await res.text();
              const parsed = text ? JSON.parse(text) : null;
              detail = parsed?.message || parsed?.hint || text || '';
            } catch {
              /* non-JSON body — fall through to the status line */
            }
            rejectReason = `${res.status} ${detail}`.trim();
            logger.warn(`[outbox] ${entry.kind} rejected: ${rejectReason}`);
          }
        } catch {
          outcome = 'offline'; // network error → we're offline from here on.
        }

        if (outcome === 'ok') {
          uploaded += 1;
          continue; // drop it from the queue
        }
        if (outcome === 'offline') {
          offline = true;
          kept.push(entry);
          continue;
        }
        // Rejected: count the strike and remember why. We keep retrying a few
        // flushes (the cause may be transient, e.g. a 5xx) and then stop, but we
        // NEVER drop the row — it stays queued and flagged so the write can't
        // silently vanish. `isFailed` skips it on later passes.
        const attempts = (entry.attempts ?? 0) + 1;
        kept.push({ ...entry, attempts, lastError: rejectReason || entry.lastError });
      }

      // Persist if anything changed: rows uploaded (queue shrank) or a row's
      // retry count / error reason was updated. Rows enqueued *during* this
      // flush — e.g. a scan mid-upload — aren't in `pending`; carry them forward.
      const changed =
        kept.length !== pending.length ||
        kept.some((k, i) => {
          const before = pending[i];
          return (
            before?.id !== k.id ||
            before?.attempts !== k.attempts ||
            before?.lastError !== k.lastError
          );
        });
      if (changed) {
        const processed = new Set(pending.map((p) => p.id));
        const addedDuringFlush = get().items.filter((i) => !processed.has(i.id));
        const next = [...kept, ...addedDuringFlush];
        writeToDisk(next);
        set({ items: next });
      }
    } finally {
      set({ flushing: false });
    }
    return uploaded;
  },
}));
