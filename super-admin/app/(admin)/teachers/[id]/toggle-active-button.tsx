'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { setTeacherActiveAction } from '@/app/actions/teachers';

interface Props {
  teacherId: string;
  currentlyActive: boolean;
}

export function ToggleActiveButton({ teacherId, currentlyActive }: Props) {
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(() => {
      void setTeacherActiveAction(teacherId, !currentlyActive);
    });
  };

  return (
    <Button
      variant={currentlyActive ? 'destructive' : 'default'}
      size="sm"
      onClick={toggle}
      disabled={pending}
    >
      {pending ? 'Saving…' : currentlyActive ? 'Deactivate' : 'Reactivate'}
    </Button>
  );
}
