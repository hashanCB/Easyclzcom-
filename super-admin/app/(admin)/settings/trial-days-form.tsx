'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle } from 'lucide-react';

import { updateTrialDaysAction, type UpdateSettingResult } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: UpdateSettingResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>;
}

export function TrialDaysForm({ currentDays }: { currentDays: number }) {
  const [state, formAction] = useFormState(updateTrialDaysAction, initial);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="trial_days">Trial length (days)</Label>
        <Input
          id="trial_days"
          name="trial_days"
          type="number"
          min={1}
          max={365}
          defaultValue={currentDays}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          How many free-trial days a new teacher gets when they sign up. Change it for a
          season (e.g. 30 for a promo). Only affects teachers who sign up after you save —
          teachers already on a trial keep their current end date.
        </p>
      </div>

      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle className="h-4 w-4" />
          Saved. New sign-ups will use this trial length.
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
