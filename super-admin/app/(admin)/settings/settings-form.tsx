'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle, Link as LinkIcon } from 'lucide-react';

import { updateStudentWebUrlAction, type UpdateSettingResult } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: UpdateSettingResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save'}
    </Button>
  );
}

export function SettingsForm({ currentUrl }: { currentUrl: string }) {
  const [state, formAction] = useFormState(updateStudentWebUrlAction, initial);

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="student_web_url">Student Portal URL</Label>
        <Input
          id="student_web_url"
          name="student_web_url"
          type="text"
          defaultValue={currentUrl}
          placeholder="http://localhost:3100"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Base URL of the student web app. All join &amp; invite links teachers
          generate point here — e.g. <code>{currentUrl || 'http://localhost:3100'}/join?token=…</code>.
          Change this when you move from localhost to a real domain.
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
          Saved. New links will use this URL immediately.
        </div>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Open portal
          </a>
        )}
      </div>
    </form>
  );
}
