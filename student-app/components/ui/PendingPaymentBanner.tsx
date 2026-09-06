import { Clock } from 'lucide-react';

interface PendingPaymentBannerProps {
  teacherUsername?: string | null;
  fullBlock?: boolean;
}

/**
 * Purple banner shown when a student's join_status is 'pending_payment' —
 * they have been added to the class but their first payment hasn't been
 * confirmed yet (the money gate).
 */
export function PendingPaymentBanner({ teacherUsername, fullBlock = false }: PendingPaymentBannerProps) {
  const teacher = teacherUsername ?? 'your teacher';

  if (fullBlock) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-purple-200 bg-purple-50 px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
          <Clock className="h-7 w-7 text-purple-600" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-purple-900">First payment pending</p>
          <p className="text-xs text-purple-700 leading-relaxed">
            You have been added to the class. Once {teacher} confirms your first payment,
            you will have full access here.
          </p>
          <p className="text-xs text-purple-600 font-medium mt-2">
            Show your QR code to your teacher or assistant when you pay.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
      <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-600" />
      <div>
        <p className="text-xs font-semibold text-purple-900">First payment pending</p>
        <p className="text-xs text-purple-700 leading-snug mt-0.5">
          You are enrolled but your first payment hasn&apos;t been confirmed yet.
          Show your QR code to {teacher} or their assistant to pay and activate your account.
        </p>
      </div>
    </div>
  );
}
