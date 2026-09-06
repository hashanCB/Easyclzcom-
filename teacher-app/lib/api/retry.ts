// One-retry-with-backoff for transient network failures.
//
// IMPORTANT — only use this for requests that are SAFE TO REPEAT. A retry fires
// when fetch throws (no response) or returns a transient 5xx, but a thrown fetch
// can still mean the server already processed the request and only the response
// was lost. So retrying a non-idempotent POST (send OTP/SMS, record a payment,
// rotate a single-use refresh token) could double-fire the side effect. Those
// callers must NOT enable retry — the user simply taps again. Reads (GET) and
// side-effect-free POSTs like login are safe.

// Gateway / overloaded statuses worth a second attempt; 4xx and other 5xx are
// deterministic and not retried.
const TRANSIENT_STATUS = new Set([502, 503, 504, 522, 524]);

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RetryOptions {
  /** Number of extra attempts after the first (default 1 = up to 2 total). */
  retries?: number;
  /** Base backoff in ms; grows linearly per attempt (default 700). */
  baseDelayMs?: number;
}

/**
 * fetch() wrapper that retries transient network failures. Returns the Response
 * (including a final non-transient error response) for the caller to handle as
 * usual. Throws only if every attempt fails to reach the server.
 */
export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const { retries = 1, baseDelayMs = 700 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (TRANSIENT_STATUS.has(res.status) && attempt < retries) {
        await delay(baseDelayMs * (attempt + 1));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await delay(baseDelayMs * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  // Unreachable, but satisfies the type checker.
  throw lastErr ?? new Error('fetchWithRetry: exhausted retries');
}
