// Per-student fee resolution. A student either pays the class fee ('regular'),
// nothing ('free'), or a custom discounted amount ('custom'). Keep this the one
// place fees are derived so the teacher and assistant collection flows agree.

export type FeeType = 'regular' | 'free' | 'custom';

export interface FeeBearingStudent {
  feeType?: string | null;
  customFeeCents?: number | null;
}

/**
 * The fee (in cents) a student owes per month, given their class's fee.
 * 'free' → 0; 'custom' → their custom amount (falls back to the class fee if
 * somehow unset); anything else → the class fee.
 */
export function effectiveFeeCents(student: FeeBearingStudent, classFeeCents: number): number {
  if (student.feeType === 'free') return 0;
  if (student.feeType === 'custom') return student.customFeeCents ?? classFeeCents;
  return classFeeCents;
}

/**
 * Same as effectiveFeeCents but tolerant of an unknown class fee (null) — used
 * by the assistant working set, which may not have hydrated the class fee yet.
 * 'free' is always 0; 'custom' is its amount; 'regular' is the (maybe-null) fee.
 */
export function effectiveFeeCentsOrNull(
  student: FeeBearingStudent,
  classFeeCents: number | null,
): number | null {
  if (student.feeType === 'free') return 0;
  if (student.feeType === 'custom') return student.customFeeCents ?? classFeeCents;
  return classFeeCents;
}
