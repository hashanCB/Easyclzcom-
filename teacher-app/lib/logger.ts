// Thin logging facade so the app isn't noisy in release builds and so real
// errors can be forwarded to telemetry from one place.
//
//   logger.warn(...)  — non-fatal issues (failed repo read, best-effort upload).
//                       Printed only in dev; silent in production.
//   logger.error(...) — real errors. Printed in dev AND forwarded to analytics
//                       in every build, so production problems are visible.
//
// Drop-in for console.warn / console.error (same call shape).

import { logEvent } from './analytics';

function preview(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.message;
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ')
    .slice(0, 300);
}

export const logger = {
  warn(...args: unknown[]): void {
    if (__DEV__) console.warn(...args);
  },

  error(...args: unknown[]): void {
    if (__DEV__) console.error(...args);
    // Best-effort telemetry — logging must never throw.
    try {
      logEvent('app.error', { detail: preview(args) });
    } catch {
      /* ignore */
    }
  },
};
