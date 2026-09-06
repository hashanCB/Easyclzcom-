import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

interface TokenAttempt {
  teacher_id: string;
  attempted_device_id: string;
  attempted_at: string;
  teachers: { username: string; name: string | null } | null;
}

interface Props {
  attempts: TokenAttempt[];
  error?: string;
}

export function TokenAttemptsTab({ attempts, error }: Props) {
  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive">Failed to load attempts: {error}</p>
      )}

      {attempts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <ShieldAlert className="h-8 w-8" />
          <p className="text-sm">No duplicate token attempts recorded.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Showing the latest {attempts.length} attempts. Each row means someone tried to activate
            a token on a device that didn&apos;t match the bound device.
          </p>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Teacher</th>
                  <th className="px-4 py-3 text-left font-medium">Attempted Device</th>
                  <th className="px-4 py-3 text-left font-medium">At</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a, i) => {
                  const t = Array.isArray(a.teachers) ? a.teachers[0] : a.teachers;
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/teachers/${a.teacher_id}`}
                          className="font-mono text-primary underline-offset-4 hover:underline"
                        >
                          {t?.username ?? a.teacher_id.slice(0, 8)}
                        </Link>
                        {t?.name && (
                          <span className="ml-2 text-muted-foreground">{t.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {a.attempted_device_id}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(a.attempted_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
