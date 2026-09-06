import { PauseCircle } from 'lucide-react';

interface SuspendedBannerProps {
  teacherUsername?: string | null;
  /** If true, renders a full-page centred block instead of an inline banner. */
  fullBlock?: boolean;
}

/**
 * Inline amber banner shown on portal pages when a student's portal access
 * for the selected enrollment has been suspended by their teacher or admin.
 */
export function SuspendedBanner({ teacherUsername, fullBlock = false }: SuspendedBannerProps) {
  const teacher = teacherUsername ?? 'your teacher';

  if (fullBlock) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <PauseCircle className="h-7 w-7 text-amber-600" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-amber-900">Portal access suspended</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Your portal access for this class has been temporarily suspended.
            You cannot access class content until your teacher restores access.
          </p>
          <p className="text-xs text-amber-600 font-medium mt-2">
            Contact {teacher} to restore access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <PauseCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
      <div>
        <p className="text-xs font-semibold text-amber-900">Portal access suspended</p>
        <p className="text-xs text-amber-700 leading-snug mt-0.5">
          Your access for this class has been temporarily suspended. Contact {teacher} to restore it.
        </p>
      </div>
    </div>
  );
}
