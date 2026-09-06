'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle } from 'lucide-react';

import { updateApkDownloadUrlAction } from '@/app/actions/website';
import type { UpdateSettingResult } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: UpdateSettingResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>;
}

export function ApkForm({ currentUrl }: { currentUrl: string }) {
  const [state, formAction] = useFormState(updateApkDownloadUrlAction, initial);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="apk_download_url">APK Download URL</Label>
        <Input
          id="apk_download_url"
          name="apk_download_url"
          type="url"
          defaultValue={currentUrl}
          placeholder="https://… (link to the .apk file)"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          The “Google Play” button on the easyclz.com hero links here. Leave empty to hide the button.
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
          Saved. The website button now points to this link.
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
