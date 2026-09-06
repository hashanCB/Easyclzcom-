// text.lk SMS gateway adapter (provider changed from QuickSend.lk).
//
// Auth:   Bearer token (account API token).
// Send:   POST https://app.text.lk/api/v3/sms/send
//           { recipient, sender_id, type: 'plain', message }
// Balance: GET https://app.text.lk/api/v3/balance  → { data: { remaining_balance } }
//
// All v3 responses share the shape { status: 'success' | 'error', message, data }.

const BASE_URL = 'https://app.text.lk/api/v3';

export interface TextLkConfig {
  apiToken: string;
  senderId: string;
}

export interface SendResult {
  ok: boolean;
  raw: string;          // raw provider response body (stored for diagnostics)
  status: number;       // HTTP status
  costCents: number | null;
  providerMessageId: string | null;
  error: string | null;
}

/** text.lk expects recipients in 94XXXXXXXXX form. Accepts 07…, +94…, 94…. */
export function toTextLkRecipient(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return '94' + digits.slice(1);
  if (digits.startsWith('94') && digits.length === 11) return digits;
  return digits;
}

// On the DEV project (APP_ENV=dev) every SMS is prefixed so test messages are
// instantly recognisable on the phone — same gateway/token as prod, just
// marked. Production (APP_ENV unset/'prod') sends the message untouched.
function markEnv(msg: string): string {
  return Deno.env.get('APP_ENV') === 'dev' ? `[DEV] ${msg}` : msg;
}

function authHeaders(apiToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${apiToken}`,
  };
}

async function parse(res: Response): Promise<{ status: number; raw: string; json: Record<string, unknown> | null }> {
  const raw = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON body */ }
  return { status: res.status, raw, json };
}

export async function sendSingle(cfg: TextLkConfig, to: string, msg: string): Promise<SendResult> {
  let status = 0;
  let raw = '';
  let json: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${BASE_URL}/sms/send`, {
      method: 'POST',
      headers: authHeaders(cfg.apiToken),
      body: JSON.stringify({
        recipient: toTextLkRecipient(to),
        sender_id: cfg.senderId,
        type: 'plain',
        message: markEnv(msg),
      }),
    });
    ({ status, raw, json } = await parse(res));
  } catch (e) {
    return { ok: false, raw: String(e), status: 0, costCents: null, providerMessageId: null, error: 'Could not reach the SMS provider' };
  }

  const httpOk = status >= 200 && status < 300;
  const ok = httpOk && json?.status === 'success';

  const data = (json?.data ?? null) as Record<string, unknown> | null;
  let costCents: number | null = null;
  let providerMessageId: string | null = null;
  if (data) {
    const costVal = data.cost;
    if (typeof costVal === 'number') costCents = Math.round(costVal * 100);
    else if (typeof costVal === 'string' && !isNaN(parseFloat(costVal))) costCents = Math.round(parseFloat(costVal) * 100);

    const idVal = data.uid ?? data.message_id ?? data.id;
    if (typeof idVal === 'string' || typeof idVal === 'number') providerMessageId = String(idVal);
  }

  const error = ok
    ? null
    : (typeof json?.message === 'string' && json.message
        ? json.message
        : `HTTP ${status}: ${raw.slice(0, 200) || 'no response body'}`);

  return { ok, raw, status, costCents, providerMessageId, error };
}

/**
 * Send a different message to each recipient. text.lk has no batch-different
 * endpoint, so we send them one by one and report a single combined outcome
 * (the callers apply one status to the whole batch).
 */
export async function sendBulkDifferent(
  cfg: TextLkConfig,
  list: { to: string; msg: string }[],
): Promise<SendResult> {
  const results: SendResult[] = [];
  for (const item of list) {
    results.push(await sendSingle(cfg, item.to, item.msg));
  }

  const ok = results.length > 0 && results.every((r) => r.ok);
  const costCents = results.reduce<number | null>((sum, r) => {
    if (r.costCents == null) return sum;
    return (sum ?? 0) + r.costCents;
  }, null);
  const firstErr = results.find((r) => !r.ok)?.error ?? null;
  const firstId = results.find((r) => r.providerMessageId)?.providerMessageId ?? null;

  return {
    ok,
    raw: JSON.stringify(results.map((r) => r.raw)),
    status: results[0]?.status ?? 0,
    costCents,
    providerMessageId: firstId,
    error: ok ? null : (firstErr ?? 'SMS delivery failed'),
  };
}

/** Returns the account balance in LKR, or null if it could not be read. */
export async function checkBalance(cfg: TextLkConfig): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_URL}/balance`, { headers: authHeaders(cfg.apiToken) });
    const { json } = await parse(res);
    const data = (json?.data ?? null) as Record<string, unknown> | null;
    const bal = data?.remaining_balance;
    if (typeof bal === 'number') return bal;
    if (typeof bal === 'string' && !isNaN(parseFloat(bal))) return parseFloat(bal);
    return null;
  } catch {
    return null;
  }
}
