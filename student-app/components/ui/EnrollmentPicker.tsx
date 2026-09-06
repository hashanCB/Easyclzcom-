'use client';

import type { Enrollment } from '@/lib/auth';

interface Props {
  enrollments: Enrollment[];
  selectedIdx: number;
  onChange: (idx: number) => void;
}

// Horizontal scrollable teacher tab bar.
// Only renders when there are 2+ enrollments.
export function EnrollmentPicker({ enrollments, selectedIdx, onChange }: Props) {
  if (enrollments.length < 2) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {enrollments.map((e, i) => (
        <button
          key={e.student_id}
          onClick={() => onChange(i)}
          className={[
            'shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition active:scale-95',
            i === selectedIdx
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40',
          ].join(' ')}
        >
          {e.subject} · {e.teacher_username}
        </button>
      ))}
    </div>
  );
}
