// What one student owes for a paid extra class. The rule (per product spec):
//   • free mode               → 0
//   • free-card student        → 0 (free card covers extra classes too)
//   • monthly mode             → that student's own monthly fee
//   • custom mode              → the special amount set on the extra class
import { effectiveFeeCents } from '../payments/fee';

export type ExtraFeeMode = 'free' | 'monthly' | 'custom';

export function extraChargeCents(
  feeMode: string,
  customFeeCents: number | null,
  studentFee: { feeType?: string | null; customFeeCents?: number | null },
  classFeeCents: number,
): number {
  if (feeMode === 'free') return 0;
  if (studentFee.feeType === 'free') return 0; // free card → always free for extras
  if (feeMode === 'monthly') return effectiveFeeCents(studentFee, classFeeCents);
  if (feeMode === 'custom') return Math.max(0, customFeeCents ?? 0);
  return 0;
}
