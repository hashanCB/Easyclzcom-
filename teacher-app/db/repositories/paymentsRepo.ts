import { eq, isNull, and, or, sql, gte, lte, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import { payments, students, classes, studentClasses, type NewPayment, type Payment, type Student } from '../schema';
import { effectiveFeeCents } from '../../lib/payments/fee';

export interface PaymentFilter {
  teacherId?: string;
  classId?: string;
  studentId?: string;
  month?: string;       // YYYY-MM — single month (legacy, still supported)
  fromMonth?: string;   // YYYY-MM — range start (inclusive)
  toMonth?: string;     // YYYY-MM — range end (inclusive)
  status?: string;      // 'paid' | 'free' | 'partial' | 'all'
  monthlyOnly?: boolean; // true = exclude extra-class payments (regular fee only)
}

/** A free-card student — owes nothing in a class, but we track the waived fee. */
export interface FreeStudent extends Student {
  /** Class name for the all-classes view. */
  className?: string;
  /** The class this free card applies to (may differ from the primary classId). */
  freeClassId: string;
  /** The monthly fee being waived (= the class fee). */
  waivedCents: number;
}

/** Money the teacher gives away each month: full waivers + partial discounts. */
export interface DiscountSummary {
  /** Students on a free card (per class — a student free in 2 classes counts twice). */
  freeCount: number;
  /** Total monthly fee waived by free cards. */
  freeWaivedCents: number;
  /** Enrollments paying a reduced (custom) amount below the class fee. */
  discountCount: number;
  /** Total monthly discount given to those offers (classFee − custom). */
  discountCents: number;
  /** freeWaivedCents + discountCents. */
  totalGivenCents: number;
}

/** A student who still owes money this month — nothing paid, or only a part. */
export interface OutstandingStudent extends Student {
  /** Total collected so far this month (summed across rows). */
  paidCents: number;
  /** The student's effective monthly fee (custom amount or class fee). */
  feeCents: number;
  /** Still owed: fee − paid. */
  remainingCents: number;
  payStatus: 'unpaid' | 'partial';
  /** Class name — populated in the all-classes view so rows stay identifiable. */
  className?: string;
  /** The month (YYYY-MM) this outstanding row is for. */
  month: string;
}

/**
 * Inclusive list of YYYY-MM months from `from` to `to`. Steps with integer
 * counters (never date.setMonth, which overflows on month-end days). If the
 * range is reversed or invalid we fall back to just the `to` month, and we cap
 * the span so a stray input can't spin up an unbounded loop.
 */
function monthsInRange(from: string, to: string): string[] {
  const parse = (ym: string): [number, number] | null => {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]) - 1]; // year, 0-based month
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return b ? [to] : [];
  if (from > to) return [to];

  const out: string[] = [];
  let [year, month] = a;
  const [endYear, endMonth] = b;
  for (let i = 0; i < 36; i++) {
    out.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    if (year === endYear && month === endMonth) break;
    if (++month > 11) { month = 0; year += 1; }
  }
  return out;
}

// Active classes for a teacher (optionally just one), with their monthly fee
// and the bits needed to build a readable class label.
function activeClasses(teacherId: string, classId?: string) {
  const conds = [eq(classes.teacherId, teacherId), eq(classes.isActive, true), isNull(classes.deletedAt)];
  if (classId) conds.push(eq(classes.id, classId));
  return getDb()
    .select({ id: classes.id, fee: classes.monthlyFeeCents, subject: classes.subject, batch: classes.batch, grade: classes.grade })
    .from(classes)
    .where(and(...conds))
    .all();
}

// Active + confirmed students who belong to a class (via enrollment or legacy
// class_id), each with the per-class fee resolved (enrollment first, then the
// student-level fee). The one place membership + fee resolution lives.
function studentsWithFeeForClass(
  classId: string,
): { student: Student; feeType: string | null; customFeeCents: number | null }[] {
  const db = getDb();
  const enrollRows = db
    .select()
    .from(studentClasses)
    .where(and(eq(studentClasses.classId, classId), isNull(studentClasses.deletedAt)))
    .all();
  const byStudent = new Map(enrollRows.map((r) => [r.studentId, r]));
  const ids = enrollRows.map((r) => r.studentId);
  const membership =
    ids.length > 0
      ? or(inArray(students.id, ids), eq(students.classId, classId))!
      : eq(students.classId, classId);
  const studs = db
    .select()
    .from(students)
    .where(
      and(membership, eq(students.isActive, true), isNull(students.deletedAt), eq(students.joinStatus, 'confirmed')),
    )
    .all();
  return studs.map((s) => {
    const enr = byStudent.get(s.id);
    return { student: s, feeType: enr?.feeType ?? s.feeType, customFeeCents: enr?.customFeeCents ?? s.customFeeCents };
  });
}

export const paymentsRepo = {
  findAll(filter: PaymentFilter = {}): Payment[] {
    const conds = [isNull(payments.deletedAt)];
    if (filter.teacherId) conds.push(eq(payments.teacherId, filter.teacherId));
    if (filter.classId) conds.push(eq(payments.classId, filter.classId));
    if (filter.studentId) conds.push(eq(payments.studentId, filter.studentId));
    if (filter.monthlyOnly) conds.push(isNull(payments.extraClassId));
    if (filter.month) conds.push(eq(payments.month, filter.month));
    if (filter.fromMonth) conds.push(gte(payments.month, filter.fromMonth));
    if (filter.toMonth) conds.push(lte(payments.month, filter.toMonth));
    if (filter.status && filter.status !== 'all') conds.push(eq(payments.status, filter.status));
    return getDb()
      .select()
      .from(payments)
      .where(and(...conds))
      .orderBy(sql`${payments.collectedAt} DESC`)
      .all();
  },

  /**
   * Students in a class who still owe money for the month — those with no
   * payment at all (unpaid) and those who've only paid part of the fee
   * (partial). Each carries the amount paid and the balance remaining so the
   * UI can show "LKR 1,000 due". A student exempt for the month (a 'free' row)
   * or whose payments cover the fee is settled and excluded.
   */
  findOutstandingStudents(classId: string, month: string, _teacherId: string): OutstandingStudent[] {
    const classFeeCents = getDb()
      .select({ fee: classes.monthlyFeeCents })
      .from(classes)
      .where(eq(classes.id, classId))
      .get()?.fee ?? 0;

    // Enrollments for this class (many-to-many). Each carries its own per-class
    // fee. A student may belong to this class either through an enrollment row
    // or the legacy primary class_id.
    const enrollRows = getDb()
      .select()
      .from(studentClasses)
      .where(and(eq(studentClasses.classId, classId), isNull(studentClasses.deletedAt)))
      .all();
    const enrollByStudent = new Map(enrollRows.map((r) => [r.studentId, r]));
    const enrolledIds = enrollRows.map((r) => r.studentId);

    const membership =
      enrolledIds.length > 0
        ? or(inArray(students.id, enrolledIds), eq(students.classId, classId))!
        : eq(students.classId, classId);

    const allStudents = getDb()
      .select()
      .from(students)
      .where(
        and(
          membership,
          eq(students.isActive, true),
          isNull(students.deletedAt),
          // Exclude self-joined students who haven't paid yet — they're not
          // officially enrolled until their first payment clears the money gate.
          eq(students.joinStatus, 'confirmed'),
        ),
      )
      .all();

    // This month's payment rows for the class — sum per student, and note any
    // 'free' exemption.
    const rows = getDb()
      .select({ studentId: payments.studentId, amountCents: payments.amountCents, status: payments.status })
      .from(payments)
      // Only the regular monthly fee — extra-class payments are tracked separately.
      .where(and(eq(payments.classId, classId), eq(payments.month, month), isNull(payments.extraClassId), isNull(payments.deletedAt)))
      .all();

    const paidByStudent = new Map<string, number>();
    const exempt = new Set<string>();
    for (const r of rows) {
      if (r.status === 'free') exempt.add(r.studentId);
      paidByStudent.set(r.studentId, (paidByStudent.get(r.studentId) ?? 0) + (r.amountCents ?? 0));
    }

    const out: OutstandingStudent[] = [];
    for (const s of allStudents) {
      if (exempt.has(s.id)) continue;
      // Per-class fee: use this student's enrollment fee for THIS class if they
      // have one; otherwise fall back to the legacy student-level fee.
      const enr = enrollByStudent.get(s.id);
      const feeSource = enr ? { feeType: enr.feeType, customFeeCents: enr.customFeeCents } : s;
      // 'free' students owe nothing — never outstanding.
      if (feeSource.feeType === 'free') continue;
      // Per-student fee: 'custom' uses their amount, otherwise the class fee.
      const feeCents = effectiveFeeCents(feeSource, classFeeCents);
      const paidCents = paidByStudent.get(s.id) ?? 0;
      // Fully covered (only when we know the fee) → settled, skip.
      if (feeCents > 0 && paidCents >= feeCents) continue;
      // Paid something but not enough, and we know the fee → partial.
      // Anything else (no payment, or unknown fee with no payment) → unpaid.
      const isPartial = feeCents > 0 && paidCents > 0;
      out.push({
        ...s,
        paidCents,
        feeCents,
        remainingCents: Math.max(0, feeCents - paidCents),
        payStatus: isPartial ? 'partial' : 'unpaid',
        month,
      });
    }

    // Fully unpaid first (most urgent), then partials; alphabetical within each.
    return out.sort((a, b) => {
      if (a.payStatus !== b.payStatus) return a.payStatus === 'unpaid' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  },

  /**
   * Outstanding students for a single class across an inclusive month range.
   * A student appears once per month they still owe for (e.g. owes Jan and
   * Mar → two rows). Sorted unpaid-first, then by month, then student name.
   */
  findOutstandingStudentsRange(
    classId: string,
    fromMonth: string,
    toMonth: string,
    teacherId: string,
  ): OutstandingStudent[] {
    const out: OutstandingStudent[] = [];
    for (const month of monthsInRange(fromMonth, toMonth)) {
      out.push(...this.findOutstandingStudents(classId, month, teacherId));
    }
    return out.sort((a, b) => {
      if (a.payStatus !== b.payStatus) return a.payStatus === 'unpaid' ? -1 : 1;
      if (a.month !== b.month) return a.month < b.month ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  },

  /**
   * Outstanding students across every active class the teacher owns — the
   * "All classes" view. Each class is evaluated with its own monthly fee, and
   * rows carry the class name so the combined list stays readable. Sorted
   * unpaid-first (most urgent), then by class, then student name.
   */
  findOutstandingForTeacher(teacherId: string, month: string): OutstandingStudent[] {
    const teacherClasses = getDb()
      .select({ id: classes.id, subject: classes.subject, batch: classes.batch, grade: classes.grade })
      .from(classes)
      .where(and(eq(classes.teacherId, teacherId), eq(classes.isActive, true), isNull(classes.deletedAt)))
      .all();

    const out: OutstandingStudent[] = [];
    for (const c of teacherClasses) {
      const className = `${c.subject} · ${c.batch} (Grade ${c.grade})`;
      for (const s of this.findOutstandingStudents(c.id, month, teacherId)) {
        out.push({ ...s, className });
      }
    }

    return out.sort((a, b) => {
      if (a.payStatus !== b.payStatus) return a.payStatus === 'unpaid' ? -1 : 1;
      const byClass = (a.className ?? '').localeCompare(b.className ?? '');
      if (byClass !== 0) return byClass;
      return a.name.localeCompare(b.name);
    });
  },

  /**
   * "All classes" outstanding across an inclusive month range. Combines the
   * per-class fee handling of findOutstandingForTeacher with the per-month
   * expansion of the range query. Sorted unpaid-first, then month, then class,
   * then student name.
   */
  findOutstandingForTeacherRange(
    teacherId: string,
    fromMonth: string,
    toMonth: string,
  ): OutstandingStudent[] {
    const out: OutstandingStudent[] = [];
    for (const month of monthsInRange(fromMonth, toMonth)) {
      out.push(...this.findOutstandingForTeacher(teacherId, month));
    }
    return out.sort((a, b) => {
      if (a.payStatus !== b.payStatus) return a.payStatus === 'unpaid' ? -1 : 1;
      if (a.month !== b.month) return a.month < b.month ? -1 : 1;
      const byClass = (a.className ?? '').localeCompare(b.className ?? '');
      if (byClass !== 0) return byClass;
      return a.name.localeCompare(b.name);
    });
  },

  /**
   * Free-card students — those who owe nothing (fee_type 'free') in a class.
   * Returned separately from the outstanding list so the collection screen can
   * show them tagged "Free" without counting them as unpaid. `classId` scopes to
   * one class; omit it for every active class.
   */
  findFreeStudents(teacherId: string, classId?: string): FreeStudent[] {
    const out: FreeStudent[] = [];
    for (const c of activeClasses(teacherId, classId)) {
      const className = `${c.subject} · ${c.batch} (Grade ${c.grade})`;
      for (const { student, feeType } of studentsWithFeeForClass(c.id)) {
        if (feeType === 'free') {
          out.push({ ...student, className, freeClassId: c.id, waivedCents: c.fee });
        }
      }
    }
    return out.sort((a, b) => (a.className ?? '').localeCompare(b.className ?? '') || a.name.localeCompare(b.name));
  },

  /**
   * How much the teacher gives away each month: full waivers (free cards) plus
   * partial discounts (custom fee below the class fee). Per active class,
   * optionally scoped to one. Recurring monthly figures, not a single month's
   * collection.
   */
  discountSummaryForTeacher(teacherId: string, classId?: string): DiscountSummary {
    let freeCount = 0, freeWaivedCents = 0, discountCount = 0, discountCents = 0;
    for (const c of activeClasses(teacherId, classId)) {
      for (const { feeType, customFeeCents } of studentsWithFeeForClass(c.id)) {
        if (feeType === 'free') {
          freeCount++;
          freeWaivedCents += c.fee;
        } else if (feeType === 'custom') {
          const paid = customFeeCents ?? c.fee;
          const off = Math.max(0, c.fee - paid);
          if (off > 0) {
            discountCount++;
            discountCents += off;
          }
        }
      }
    }
    return { freeCount, freeWaivedCents, discountCount, discountCents, totalGivenCents: freeWaivedCents + discountCents };
  },

  findByStudent(studentId: string): Payment[] {
    return getDb()
      .select()
      .from(payments)
      .where(and(eq(payments.studentId, studentId), isNull(payments.deletedAt)))
      .orderBy(sql`${payments.month} DESC`)
      .all();
  },

  /** All payments recorded against one extra class. */
  findByExtraClass(extraClassId: string): Payment[] {
    return getDb()
      .select()
      .from(payments)
      .where(and(eq(payments.extraClassId, extraClassId), isNull(payments.deletedAt)))
      .all();
  },

  findByClassAndMonth(classId: string, month: string): Payment[] {
    return getDb()
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.classId, classId),
          eq(payments.month, month),
          isNull(payments.deletedAt),
        ),
      )
      .all();
  },

  findById(id: string): Payment | undefined {
    return getDb()
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .get();
  },

  findByStudentAndMonth(studentId: string, month: string): Payment | undefined {
    return getDb()
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.studentId, studentId),
          eq(payments.month, month),
          isNull(payments.deletedAt),
        ),
      )
      .get();
  },

  insert(data: NewPayment): void {
    getDb().insert(payments).values(data).run();
  },

  /**
   * Returns true only when the student is already fully settled for the month
   * (a 'paid' or 'free' row exists). A 'partial' row does NOT count as a
   * duplicate so that a teacher can record the remaining balance as a top-up.
   */
  hasDuplicate(studentId: string, month: string): boolean {
    const row = getDb()
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.studentId, studentId),
          eq(payments.month, month),
          isNull(payments.deletedAt),
          or(eq(payments.status, 'paid'), eq(payments.status, 'free')),
        ),
      )
      .get();
    return row !== undefined;
  },

  /** Payments are never deleted. Use a correction row instead. */
  update(id: string, data: Partial<NewPayment>): void {
    const now = new Date().toISOString();
    getDb()
      .update(payments)
      .set({ ...data, updatedAt: now, clientUpdatedAt: now })
      .where(eq(payments.id, id))
      .run();
  },

  /** Summary: total collected, pending (active students not paid this month), today collected */
  summary(teacherId: string, month: string, todayIso: string): {
    totalCents: number;
    todayCents: number;
    paidCount: number;
    partialCount: number;
  } {
    const rows = getDb()
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.teacherId, teacherId),
          eq(payments.month, month),
          isNull(payments.deletedAt),
        ),
      )
      .all();

    let totalCents = 0;
    let todayCents = 0;
    let paidCount = 0;
    let partialCount = 0;

    for (const r of rows) {
      totalCents += r.amountCents;
      if (r.collectedAt.startsWith(todayIso)) todayCents += r.amountCents;
      if (r.status === 'paid') paidCount++;
      if (r.status === 'partial') partialCount++;
    }
    return { totalCents, todayCents, paidCount, partialCount };
  },

  // backup/restore helpers
  deleteAllByTeacher(teacherId: string): void {
    getDb().delete(payments).where(eq(payments.teacherId, teacherId)).run();
  },

  upsert(data: NewPayment): void {
    getDb()
      .insert(payments)
      .values(data)
      .onConflictDoUpdate({ target: payments.id, set: { ...data } })
      .run();
  },
};
