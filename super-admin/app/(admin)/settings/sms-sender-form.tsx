'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle } from 'lucide-react';

import { updateSmsSenderNameAction, type UpdateSettingResult } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: UpdateSettingResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>;
}

export function SmsSenderForm({ currentSender }: { currentSender: string }) {
  const [state, formAction] = useFormState(updateSmsSenderNameAction, initial);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="sms_sender_name">Sender Name</Label>
        <Input
          id="sms_sender_name"
          name="sms_sender_name"
          type="text"
          defaultValue={currentSender}
          placeholder="e.g. Mainrio"
          maxLength={11}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Shown as the SMS sender on student phones. Must be pre-registered in your text.lk account dashboard before use.
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
          Saved. Next OTP will use this sender name.
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
