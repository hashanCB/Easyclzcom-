import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Payment, NewPayment, PaymentCorrection, NewPaymentCorrection } from '../../db/schema';
import type { PaymentFilter, OutstandingStudent, FreeStudent, DiscountSummary } from '../../db/repositories/paymentsRepo';
import { scheduleSync } from '../sync/engine';
import { logger } from '../logger';

type PaymentsRepo = typeof import('../../db/repositories/paymentsRepo').paymentsRepo;
type CorrectionsRepo = typeof import('../../db/repositories/paymentCorrectionsRepo').paymentCorrectionsRepo;

function getRepo(): PaymentsRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/paymentsRepo').paymentsRepo as PaymentsRepo;
  } catch {
    return null;
  }
}

function getCorrectionsRepo(): CorrectionsRepo | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('../../db/repositories/paymentCorrectionsRepo').paymentCorrectionsRepo as CorrectionsRepo;
  } catch {
    return null;
  }
}

export function usePaymentsList(filter: PaymentFilter) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const key = JSON.stringify(filter);
  const refresh = useCallback(() => {
    const repo = getRepo();
    if (!repo) {
      setPayments([]);
      setLoading(false);
      return;
    }
    try {
      setPayments(repo.findAll(filter));
    } catch (e) {
      logger.warn('payments.findAll failed', e);
      setPayments([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);
  return { payments, loading, refresh, isWeb: Platform.OS === 'web' };
}

export function usePayment(id: string | undefined) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [corrections, setCorrections] = useState<PaymentCorrection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!id) { setLoading(false); return; }
    const repo = getRepo();
    const cRepo = getCorrectionsRepo();
    if (!repo) { setLoading(false); return; }
    try {
      setPayment(repo.findById(id) ?? null);
      setCorrections(cRepo ? cRepo.findByPayment(id) : []);
    } catch (e) {
      logger.warn('payment.findById failed', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  return { payment, corrections, loading, refresh };
}

export function useUnpaidStudents(classId: string, month: string, teacherId: string) {
  const [unpaid, setUnpaid] = useState<OutstandingStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    // An empty classId means "all classes" — aggregate across the teacher's
    // classes. We still need a month and teacher to query anything.
    if (!month || !teacherId) {
      setUnpaid([]);
      setLoading(false);
      return;
    }
    const repo = getRepo();
    if (!repo) { setUnpaid([]); setLoading(false); return; }
    try {
      setUnpaid(
        classId
          ? repo.findOutstandingStudents(classId, month, teacherId)
          : repo.findOutstandingForTeacher(teacherId, month),
      );
    } catch (e) {
      logger.warn('findOutstandingStudents failed', e);
      setUnpaid([]);
    } finally {
      setLoading(false);
    }
  }, [classId, month, teacherId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { unpaid, loading, refresh };
}

export function useUnpaidStudentsRange(
  classId: string,
  fromMonth: string,
  toMonth: string,
  teacherId: string,
) {
  const [unpaid, setUnpaid] = useState<OutstandingStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    // An empty classId means "all classes" — aggregate across the teacher's
    // classes. We still need a range and teacher to query anything.
    if (!fromMonth || !toMonth || !teacherId) {
      setUnpaid([]);
      setLoading(false);
      return;
    }
    const repo = getRepo();
    if (!repo) { setUnpaid([]); setLoading(false); return; }
    try {
      setUnpaid(
        classId
          ? repo.findOutstandingStudentsRange(classId, fromMonth, toMonth, teacherId)
          : repo.findOutstandingForTeacherRange(teacherId, fromMonth, toMonth),
      );
    } catch (e) {
      logger.warn('findOutstandingStudentsRange failed', e);
      setUnpaid([]);
    } finally {
      setLoading(false);
    }
  }, [classId, fromMonth, toMonth, teacherId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { unpaid, loading, refresh };
}

/** Free-card students (owe nothing) for a class, or all classes when classId is ''. */
export function useFreeStudents(classId: string, teacherId: string) {
  const [free, setFree] = useState<FreeStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!teacherId) { setFree([]); setLoading(false); return; }
    const repo = getRepo();
    if (!repo) { setFree([]); setLoading(false); return; }
    try {
      setFree(repo.findFreeStudents(teacherId, classId || undefined));
    } catch (e) {
      logger.warn('findFreeStudents failed', e);
      setFree([]);
    } finally {
      setLoading(false);
    }
  }, [classId, teacherId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { free, loading, refresh };
}

/** Monthly money given away: free waivers + custom-fee discounts. */
export function useDiscountSummary(teacherId: string, classId?: string): DiscountSummary | null {
  const [summary, setSummary] = useState<DiscountSummary | null>(null);

  const refresh = useCallback(() => {
    if (!teacherId) { setSummary(null); return; }
    const repo = getRepo();
    if (!repo) { setSummary(null); return; }
    try {
      setSummary(repo.discountSummaryForTeacher(teacherId, classId || undefined));
    } catch {
      setSummary(null);
    }
  }, [teacherId, classId]);

  useEffect(() => { refresh(); }, [refresh]);
  return summary;
}

export function useRefundedPaymentIds(teacherId: string): Set<string> {
  const [ids, setIds] = useState(new Set<string>());

  const refresh = useCallback(() => {
    const repo = getCorrectionsRepo();
    if (!repo || !teacherId) return;
    try {
      setIds(repo.findRefundedPaymentIds(teacherId));
    } catch {
      setIds(new Set());
    }
  }, [teacherId]);

  useEffect(() => { refresh(); }, [refresh]);
  return ids;
}

export function checkDuplicatePayment(studentId: string, month: string): boolean {
  const repo = getRepo();
  if (!repo) return false;
  return repo.hasDuplicate(studentId, month);
}

export function savePayment(data: NewPayment): void {
  const repo = getRepo();
  if (!repo) throw new Error('Local database is not available on web.');
  repo.insert(data);
  // Money gate: first payment from a self-joined student confirms their enrolment.
  try {
    if (Platform.OS !== 'web') {
      const sRepo = require('../../db/repositories/studentsRepo').studentsRepo;
      sRepo.confirmIfPending(data.studentId);
    }
  } catch {
    // Non-fatal — confirm will be retried on next sync if the row exists.
  }
  scheduleSync();
}

export function saveCorrection(data: NewPaymentCorrection): void {
  const repo = getCorrectionsRepo();
  if (!repo) throw new Error('Local database is not available on web.');
  repo.insert(data);
  scheduleSync();
}
