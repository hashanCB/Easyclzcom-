'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle, Copy, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { createTeacherAction, type CreateTeacherResult } from '@/app/actions/teachers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: CreateTeacherResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Creating…' : 'Create Teacher'}
    </Button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function RevealField({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm">
        <span className="flex-1 select-all">{shown ? value : '•'.repeat(value.length)}</span>
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
          title={shown ? 'Hide' : 'Reveal'}
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function NewTeacherForm() {
  const [state, action] = useFormState(createTeacherAction, initial);
  const creds = state.credentials;

  if (creds) {
    return (
      <div className="space-y-6 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 p-6">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle className="h-5 w-5" />
          <p className="font-semibold">Teacher created — save these credentials now</p>
        </div>
        <p className="text-sm text-muted-foreground">
          This information is shown <strong>once only</strong>. The password and token cannot be
          retrieved after you leave this page.
        </p>

        <div className="space-y-4 rounded-md border bg-background p-4">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Username</span>
            <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm">
              <span className="flex-1 select-all">{creds.username}</span>
              <CopyButton value={creds.username} />
            </div>
          </div>
          <RevealField label="Password" value={creds.password} />
          <RevealField label="Activation Token" value={creds.token} />
        </div>

        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/teachers">Back to Teachers</Link>
          </Button>
          <Button asChild>
            <Link href={`/teachers/${creds.teacher_id}`}>View Teacher Profile</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 rounded-lg border p-6">
      {state.error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="username">Username *</Label>
        <Input id="username" name="username" placeholder="e.g. john_silva" required />
        <p className="text-xs text-muted-foreground">Lowercase, letters/numbers/underscores only.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone *</Label>
        <Input id="phone" name="phone" placeholder="+94771234567" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Full Name</Label>
        <Input id="name" name="name" placeholder="Optional" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="Optional" />
      </div>

      <SubmitButton />

      <Button type="button" variant="ghost" className="w-full" asChild>
        <Link href="/teachers">Cancel</Link>
      </Button>
    </form>
  );
}
