import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { effectiveFeeCentsOrNull } from '../payments/fee';

// ─── Assistant working set (local-first replica) ────────────────────────────
//
// An assistant scans cards at the classroom door — often a spot with no signal.
// Hitting the database live on every scan fails there, so instead we follow the
// real-world "local-first replica with opportunistic sync" pattern:
//
//   Prepare    Hydrate the working set for one class while online (at the
//              teacher's hotspot, before class): the roster plus today's
//              attendance, this month's payment status, and the class fee.
//   Run        At the door every scan resolves from this local snapshot — no
//              network needed. Marks/payments update the snapshot optimistically
//              and queue in the outbox.
//   Reconcile  When connectivity returns we flush the outbox and re-hydrate, so
//              the snapshot catches up with anything the teacher changed.
//
// The snapshot is per-class and scoped to today/this-month, so a single JSON
// file is plenty. It is intentionally short-lived: cleared when the session ends.

export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface WsStudent {
  id: string;
  name: string;
  student_code: string;
  grade: string | null;
  batch: string | null;
  card_version: number;
  /** 'regular' uses the class fee, 'free' owes nothing, 'custom' uses custom_fee_cents. */
  fee_type: string | null;
  /** Discounted fixed fee in cents when fee_type is 'custom'; null otherwise. */
  custom_fee_cents: number | null;
  /** Phone — used by the door "find by name" fallback for students with no card. */
  student_phone: string | null;
  /**
   * 'confirmed'        — a real, paid-once student (counted in money).
   * 'pending_payment'  — self-joined via class code, awaiting their first
   *                      payment; collecting it at the door registers them.
   */
  join_status: string | null;
}

export interface WorkingSet {
  classId: string;
  /** ISO time of the last successful hydrate; null = never reached the server. */
  syncedAt: string | null;
  /** The day the attendance map describes (YYYY-MM-DD). */
  date: string;
  /** The month the payment map describes (YYYY-MM). */
  month: string;
  feeCents: number | null;
  students: WsStudent[];
  /** student_id → attendance status, for students already marked today. */
  attendance: Record<string, AttendanceStatus>;
  /**
   * student_id → total cents collected this month (summed across every payment
   * row). We track the *amount*, not a status string, so partial payments
   * accumulate: pay LKR 500 then LKR 1,000 and the running total is LKR 1,500.
   * The paid/partial/unpaid status is derived from this total vs the class fee.
   */
  paidCents: Record<string, number>;
}

/** Derived this-month payment picture for one student. */
export interface PaymentState {
  /** Total collected so far this month. */
  paidCents: number;
  /** The class's monthly fee, or null when unknown (offline before hydrate). */
  feeCents: number | null;
  /** Still owed: max(0, fee − paid); 0 when the fee is unknown. */
  remainingCents: number;
  status: 'paid' | 'partial' | 'unpaid';
}

export interface StudentLookup {
  student: WsStudent;
  /** Today's attendance from the snapshot, or null if not marked / stale day. */
  attendance: AttendanceStatus | null;
  /** This month's derived payment picture (paid / partial / unpaid + balance). */
  payment: PaymentState;
  /** True when this student is on a free card for this class — owes nothing. */
  isFree: boolean;
}

/**
 * Decide where a student stands this month from the total collected and the
 * fee. With no fee known we can't tell partial from paid, so any money counts
 * as paid. Otherwise: nothing → unpaid, covers the fee → paid, in between →
 * partial (with the remaining balance).
 */
export function paymentState(paidCents: number, feeCents: number | null): PaymentState {
  const paid = Math.max(0, Math.round(paidCents || 0));
  if (feeCents == null || feeCents <= 0) {
    return { paidCents: paid, feeCents, remainingCents: 0, status: paid > 0 ? 'paid' : 'unpaid' };
  }
  if (paid <= 0) return { paidCents: 0, feeCents, remainingCents: feeCents, status: 'unpaid' };
  if (paid >= feeCents) return { paidCents: paid, feeCents, remainingCents: 0, status: 'paid' };
  return { paidCents: paid, feeCents, remainingCents: feeCents - paid, status: 'partial' };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function wsFile(classId: string): File {
  // classId is a server uuid — safe as a filename segment.
  return new File(Paths.document, `assistant_ws_${classId}.json`);
}

/** Read the cached working set for a class (null if none cached / on web). */
export function readWorkingSet(classId: string): WorkingSet | null {
  if (Platform.OS === 'web') return null;
  try {
    const file = wsFile(classId);
    if (!file.exists) return null;
    const ws = JSON.parse(file.textSync()) as WorkingSet;
    if (!ws || !Array.isArray(ws.students)) return null;
    // Normalise older caches (which stored a `payments` status map) so the rest
    // of the code can rely on `paidCents` existing.
    if (!ws.paidCents || typeof ws.paidCents !== 'object') ws.paidCents = {};
    if (!ws.attendance || typeof ws.attendance !== 'object') ws.attendance = {};
    return ws;
  } catch {
    return null;
  }
}

function writeWorkingSet(ws: WorkingSet): void {
  if (Platform.OS === 'web') return;
  try {
    wsFile(ws.classId).write(JSON.stringify(ws));
  } catch {
    try {
      const file = wsFile(ws.classId);
      file.create({ intermediates: true, overwrite: true });
      file.write(JSON.stringify(ws));
    } catch {
      /* give up — the caller still has the in-memory copy this session */
    }
  }
}

function rest(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
  };
}

/**
 * Hydrate (Prepare/Reconcile) the working set for a class from the server and
 * cache it to disk. Best-effort: if any part can't be reached we keep whatever
 * was cached before, so the door keeps working. Returns the working set now in
 * effect (fresh, or the previous snapshot, or an empty skeleton).
 */
export async function hydrateWorkingSet(
  classId: string,
  token: string,
): Promise<WorkingSet> {
  const date = todayIso();
  const month = currentMonthKey();
  const cached = readWorkingSet(classId);

  if (Platform.OS === 'web' || !classId || !token) {
    return cached ?? emptyWorkingSet(classId, date, month);
  }

  try {
    // Per-class enrollments (many-to-many). Each carries this class's own fee, so
    // a "free card" or custom amount the teacher set for THIS class is honoured —
    // even for a student whose primary class_id is a different class. Tolerant:
    // if it can't be read (older backend, transient error) we fall back to the
    // student-level fee and the legacy class_id roster.
    let enrollments: { student_id: string; fee_type: string | null; custom_fee_cents: number | null }[] = [];
    try {
      const enrollRes = await fetch(
        `${SUPABASE_URL}/rest/v1/student_classes?class_id=eq.${classId}&deleted_at=is.null&select=student_id,fee_type,custom_fee_cents`,
        { headers: rest(token) },
      );
      if (enrollRes.ok) {
        const rows = await enrollRes.json().catch(() => []);
        if (Array.isArray(rows)) enrollments = rows;
      }
    } catch {
      /* keep enrollments empty — fall back below */
    }
    const enrollByStudent = new Map(enrollments.map((e) => [e.student_id, e]));
    const enrolledIds = enrollments.map((e) => e.student_id);

    // Roster = students whose primary class is this class OR who are enrolled in
    // it via student_classes.
    const studentSelect =
      'select=id,name,student_code,grade,batch,card_version,fee_type,custom_fee_cents,student_phone,join_status';
    const studentsUrl =
      enrolledIds.length > 0
        ? `${SUPABASE_URL}/rest/v1/students?or=(class_id.eq.${classId},id.in.(${enrolledIds.join(',')}))&deleted_at=is.null&is_active=eq.true&${studentSelect}`
        : `${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&deleted_at=is.null&is_active=eq.true&${studentSelect}`;

    const [studentsRes, attendanceRes, paymentsRes, classRes] = await Promise.all([
      fetch(studentsUrl, { headers: rest(token) }),
      fetch(
        `${SUPABASE_URL}/rest/v1/attendance?class_id=eq.${classId}&date=eq.${date}&deleted_at=is.null&select=student_id,status`,
        { headers: rest(token) },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/payments?class_id=eq.${classId}&month=eq.${month}&deleted_at=is.null&select=student_id,amount_cents`,
        { headers: rest(token) },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/classes?id=eq.${classId}&select=monthly_fee_cents&limit=1`,
        { headers: rest(token) },
      ),
    ]);

    const students = (await studentsRes.json().catch(() => [])) as WsStudent[];
    if (!Array.isArray(students)) throw new Error('bad students payload');

    // Override each student's fee with their per-class enrollment fee for THIS
    // class. Students with no enrollment row keep their student-level fee.
    for (const st of students) {
      const enr = enrollByStudent.get(st.id);
      if (enr) {
        st.fee_type = enr.fee_type;
        st.custom_fee_cents = enr.custom_fee_cents;
      }
    }

    const attRows = (await attendanceRes.json().catch(() => [])) as {
      student_id: string;
      status: AttendanceStatus;
    }[];
    const payRows = (await paymentsRes.json().catch(() => [])) as {
      student_id: string;
      amount_cents: number | null;
    }[];
    const classRows = (await classRes.json().catch(() => [])) as {
      monthly_fee_cents: number | null;
    }[];

    const attendance: Record<string, AttendanceStatus> = {};
    for (const r of Array.isArray(attRows) ? attRows : []) {
      if (r?.student_id) attendance[r.student_id] = r.status;
    }
    // Sum every payment row for the month so partial collections add up.
    const paidCents: Record<string, number> = {};
    for (const r of Array.isArray(payRows) ? payRows : []) {
      if (r?.student_id) paidCents[r.student_id] = (paidCents[r.student_id] ?? 0) + (r.amount_cents ?? 0);
    }

    // Preserve any optimistic local marks that haven't been pulled back yet, so
    // a re-hydrate mid-session never "un-marks" a student we just scanned.
    if (cached && cached.date === date) {
      for (const [id, status] of Object.entries(cached.attendance)) {
        if (!(id in attendance)) attendance[id] = status;
      }
    }
    // Same for payments: keep a locally-recorded total only for students the
    // server hasn't returned a row for yet (a payment queued but not yet
    // flushed). Once the server has any row for them, its sum is authoritative —
    // so a flushed payment isn't double-counted.
    if (cached && cached.month === month) {
      for (const [id, cents] of Object.entries(cached.paidCents)) {
        if (!(id in paidCents)) paidCents[id] = cents;
      }
    }

    const ws: WorkingSet = {
      classId,
      syncedAt: new Date().toISOString(),
      date,
      month,
      feeCents: classRows[0]?.monthly_fee_cents ?? cached?.feeCents ?? null,
      students,
      attendance,
      paidCents,
    };
    writeWorkingSet(ws);
    return ws;
  } catch {
    // Offline — fall back to whatever we cached, refreshed to today's keys so
    // stale attendance/payments from a previous day don't leak through.
    if (cached) return rolloverForToday(cached, date, month);
    return emptyWorkingSet(classId, date, month);
  }
}

function emptyWorkingSet(classId: string, date: string, month: string): WorkingSet {
  return { classId, syncedAt: null, date, month, feeCents: null, students: [], attendance: {}, paidCents: {} };
}

/** Drop attendance/payment maps that describe a previous day/month. */
function rolloverForToday(ws: WorkingSet, date: string, month: string): WorkingSet {
  if (ws.date === date && ws.month === month) return ws;
  return {
    ...ws,
    date,
    month,
    attendance: ws.date === date ? ws.attendance : {},
    paidCents: ws.month === month ? ws.paidCents : {},
  };
}

/** Look a student up entirely from the local snapshot (the Run-phase read path). */
export function lookupStudent(classId: string, studentId: string): StudentLookup | null {
  const ws = readWorkingSet(classId);
  if (!ws) return null;
  const student = ws.students.find((s) => s.id === studentId);
  if (!student) return null;
  const today = todayIso();
  const monthly = ws.month === currentMonthKey();
  const attendance = ws.date === today ? ws.attendance[studentId] ?? null : null;
  // A 'free' student owes nothing — always settled, so the Collect button hides.
  if (student.fee_type === 'free') {
    return { student, attendance, payment: { paidCents: 0, feeCents: 0, remainingCents: 0, status: 'paid' }, isFree: true };
  }
  // Per-student effective fee: 'custom' → their amount, 'regular' → the class
  // fee (may be null offline before hydrate).
  const feeCents = effectiveFeeCentsOrNull(
    { feeType: student.fee_type, customFeeCents: student.custom_fee_cents },
    ws.feeCents,
  );
  return {
    student,
    attendance,
    payment: paymentState(monthly ? ws.paidCents[studentId] ?? 0 : 0, feeCents),
    isFree: false,
  };
}

/** Record an attendance mark in the snapshot so re-scans see it immediately. */
export function applyLocalAttendance(
  classId: string,
  studentId: string,
  status: AttendanceStatus,
): void {
  const ws = readWorkingSet(classId);
  if (!ws) return;
  const next = rolloverForToday(ws, todayIso(), currentMonthKey());
  next.attendance = { ...next.attendance, [studentId]: status };
  writeWorkingSet(next);
}

/**
 * Add a cash collection to the snapshot so the badge/balance update right away.
 * Amounts accumulate — a second partial payment tops up the running total —
 * and the function returns the derived state after applying it.
 */
export function applyLocalPayment(
  classId: string,
  studentId: string,
  addCents: number,
): PaymentState {
  const ws = readWorkingSet(classId);
  if (!ws) return paymentState(addCents, null);
  const next = rolloverForToday(ws, todayIso(), currentMonthKey());
  const total = (next.paidCents[studentId] ?? 0) + Math.max(0, Math.round(addCents));
  next.paidCents = { ...next.paidCents, [studentId]: total };
  writeWorkingSet(next);
  return paymentState(total, next.feeCents);
}

/** Student ids already marked today — used by "mark remaining absent". */
export function markedStudentIds(classId: string): Set<string> {
  const ws = readWorkingSet(classId);
  if (!ws || ws.date !== todayIso()) return new Set();
  return new Set(Object.keys(ws.attendance));
}

/**
 * Add a brand-new student to the cached snapshot right after the assistant
 * registers them at the door, so they are immediately scannable/searchable and
 * the collect popup can open for them without waiting for a re-hydrate.
 */
export function addLocalStudent(classId: string, student: WsStudent): void {
  const ws = readWorkingSet(classId);
  if (!ws) return;
  if (ws.students.some((s) => s.id === student.id)) return;
  ws.students = [...ws.students, student];
  writeWorkingSet(ws);
}

/** Drop the cached working set — called when a scanning session ends. */
export function clearWorkingSet(classId: string): void {
  if (Platform.OS === 'web') return;
  try {
    const file = wsFile(classId);
    if (file.exists) file.delete();
  } catch {
    /* nothing to clean up */
  }
}
