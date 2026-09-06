import Link from 'next/link';
import { HardDrive } from 'lucide-react';

interface StorageRow {
  teacher_id: string;
  username: string;
  name: string | null;
  file_count: number;
  total_bytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

interface Props {
  rows: StorageRow[];
  error?: string;
}

export function StorageTab({ rows, error }: Props) {
  const totalBytes = rows.reduce((s, r) => s + r.total_bytes, 0);
  const totalFiles = rows.reduce((s, r) => s + r.file_count, 0);

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive">Failed to load storage data: {error}</p>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Total R2 Usage</p>
            <p className="text-xl font-semibold">{formatBytes(totalBytes)}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Total Files</p>
            <p className="text-xl font-semibold">{totalFiles.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Per-teacher table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Teacher</th>
              <th className="px-4 py-3 text-right font-medium">Files</th>
              <th className="px-4 py-3 text-right font-medium">Size</th>
              <th className="px-4 py-3 text-right font-medium">% of total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No file data yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.teacher_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/teachers/${r.teacher_id}`}
                      className="font-mono text-primary underline-offset-4 hover:underline"
                    >
                      {r.username}
                    </Link>
                    {r.name && (
                      <span className="ml-2 text-muted-foreground">{r.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.file_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBytes(r.total_bytes)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {totalBytes > 0 ? ((r.total_bytes / totalBytes) * 100).toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
