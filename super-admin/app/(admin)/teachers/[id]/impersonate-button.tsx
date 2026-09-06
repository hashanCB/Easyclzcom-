'use client';

import { useState, useTransition } from 'react';

import { impersonateTeacherAction } from '@/app/actions/teachers';
import { Button } from '@/components/ui/button';

interface Props {
  teacherId: string;
}

export function ImpersonateButton({ teacherId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    startTransition(() => { void (async () => {
      setLink(null);
      setError(null);
      const result = await impersonateTeacherAction(teacherId);
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        setLink(result.url);
      }
    })(); });
  }

  function handleCopy() {
    if (link) navigator.clipboard.writeText(link);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Generates a one-time sign-in link. Open in an incognito window — this logs in as the teacher.
      </p>

      {!link ? (
        <Button size="sm" variant="outline" disabled={isPending} onClick={handleGenerate}>
          {isPending ? 'Generating…' : 'Generate Sign-in Link'}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{link}</code>
            <Button size="sm" variant="secondary" onClick={handleCopy}>Copy</Button>
            <Button size="sm" variant="secondary" onClick={() => window.open(link, '_blank')}>
              Open
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setLink(null)}>
            Clear
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
