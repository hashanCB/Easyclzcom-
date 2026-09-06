import { NewTeacherForm } from './new-teacher-form';

export default function NewTeacherPage() {
  return (
    <main className="container mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New Teacher</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Username, password, and activation token are generated automatically and shown once.
        </p>
      </div>
      <NewTeacherForm />
    </main>
  );
}
