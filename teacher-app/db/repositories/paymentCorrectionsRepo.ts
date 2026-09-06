import { and, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { paymentCorrections, type NewPaymentCorrection, type PaymentCorrection } from '../schema';

export const paymentCorrectionsRepo = {
  findByPayment(paymentId: string): PaymentCorrection[] {
    return getDb()
      .select()
      .from(paymentCorrections)
      .where(eq(paymentCorrections.paymentId, paymentId))
      .all();
  },

  /** Returns the set of payment IDs that have at least one refund correction for this teacher. */
  findRefundedPaymentIds(teacherId: string): Set<string> {
    const rows = getDb()
      .select({ paymentId: paymentCorrections.paymentId })
      .from(paymentCorrections)
      .where(
        and(
          eq(paymentCorrections.teacherId, teacherId),
          eq(paymentCorrections.type, 'refund'),
        ),
      )
      .all();
    return new Set(rows.map((r) => r.paymentId));
  },

  insert(data: NewPaymentCorrection): void {
    getDb().insert(paymentCorrections).values(data).run();
  },

  findAllByTeacher(teacherId: string): PaymentCorrection[] {
    return getDb()
      .select()
      .from(paymentCorrections)
      .where(eq(paymentCorrections.teacherId, teacherId))
      .all();
  },

  deleteAllByTeacher(teacherId: string): void {
    getDb().delete(paymentCorrections).where(eq(paymentCorrections.teacherId, teacherId)).run();
  },

  upsert(data: NewPaymentCorrection): void {
    getDb()
      .insert(paymentCorrections)
      .values(data)
      .onConflictDoUpdate({ target: paymentCorrections.id, set: { ...data } })
      .run();
  },
};
