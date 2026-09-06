'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle } from 'lucide-react';

import { updateSupportContactPhoneAction, type UpdateSettingResult } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: UpdateSettingResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>;
}

export function SupportPhoneForm({ currentPhone }: { currentPhone: string }) {
  const [state, formAction] = useFormState(updateSupportContactPhoneAction, initial);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="support_contact_phone">Contact Number</Label>
        <Input
          id="support_contact_phone"
          name="support_contact_phone"
          type="tel"
          defaultValue={currentPhone}
          placeholder="e.g. 0776465456"
          maxLength={20}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Shown to students when they hit the monthly change limit (phone or password). Displayed as a tap-to-call link.
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
          Saved. Students will see this number when they reach their monthly limit.
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
