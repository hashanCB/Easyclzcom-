// =============================================================================
// health_check — scheduled backend health probe + admin alerting
// =============================================================================
// Trigger: a scheduler (Supabase scheduled function / pg_cron net.http_post),
//          NOT an end user. Protected by a shared secret header so it can't be
//          triggered by the public:
//              x-cron-secret: <HEALTHCHECK_SECRET>
//
// Checks (cheap, run every ~15 min):
//   1. SMS failure spike  — many 'failed' messages in the last hour.
//   2. Low SMS balance    — text.lk account balance below a floor.
//
// On a breached check it writes a row to public.system_alerts AND texts the
// admin (ALERT_PHONE) via text.lk. To avoid spam, each alert KIND has a
// cooldown: if the same kind already alerted within COOLDOWN_MINUTES, we skip
// re-alerting (the existing row stays as the open incident).
//
// Output: { ok, checks: [...], alertsFired: [...] }  (always 200 unless the
//          secret is wrong) so the scheduler log shows a clean summary.
// =============================================================================

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { checkBalance, sendSingle, type TextLkConfig } from '../_shared/textlk.ts';

const HEALTHCHECK_SECRET = Deno.env.get('HEALTHCHECK_SECRET') ?? '';
const ALERT_PHONE = Deno.env.get('ALERT_PHONE') ?? '';

const TEXTLK_API_TOKEN = Deno.env.get("TEXTLK_API_TOKEN") ?? "";
const TEXTLK_SENDER_ID = Deno.env.get("TEXTLK_SENDER_ID") ?? "TextLKDemo";

// Thresholds (env-overridable so they can be tuned without a redeploy of logic).
const FAILED_SMS_THRESHOLD = Number(Deno.env.get('HC_FAILED_SMS_THRESHOLD') ?? '10');
const LOW_BALANCE_LKR = Number(Deno.env.get('HC_LOW_BALANCE_LKR') ?? '100');
const COOLDOWN_MINUTES = Number(Deno.env.get('HC_COOLDOWN_MINUTES') ?? '60');

interface CheckResult {
  kind: string;
  ok: boolean;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: Record<string, unknown>;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // --- Auth: shared secret only (fail closed) -------------------------------
  if (!HEALTHCHECK_SECRET) {
    return errorResponse({ code: 'server_error', message: 'Health check is not configured' });
  }
  if (req.headers.get('x-cron-secret') !== HEALTHCHECK_SECRET) {
    return errorResponse({ code: 'unauthorized', message: 'Invalid or missing cron secret' });
  }

  const admin = adminClient();
  const checks: CheckResult[] = [];

  // --- Check 1: SMS failure spike in the last hour --------------------------
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  try {
    const { count } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'sms')
      .eq('status', 'failed')
      .gte('created_at', hourAgo);
    const failed = count ?? 0;
    checks.push({
      kind: 'sms_failures',
      ok: failed < FAILED_SMS_THRESHOLD,
      severity: 'critical',
      message: `${failed} SMS failed in the last hour (threshold ${FAILED_SMS_THRESHOLD}).`,
      details: { failed, threshold: FAILED_SMS_THRESHOLD, window: '1h' },
    });
  } catch (e) {
    console.error('sms_failures check failed', e);
  }

  // --- Check 2: low SMS provider balance ------------------------------------
  if (TEXTLK_API_TOKEN) {
    const cfg: TextLkConfig = {
      apiToken: TEXTLK_API_TOKEN,
      senderId: TEXTLK_SENDER_ID,
    };
    const balance = await checkBalance(cfg);
    if (balance != null) {
      checks.push({
        kind: 'low_sms_balance',
        ok: balance >= LOW_BALANCE_LKR,
        severity: 'warning',
        message: `SMS balance is LKR ${balance.toFixed(2)} (floor ${LOW_BALANCE_LKR}). Top up to avoid send failures.`,
        details: { balance, floor: LOW_BALANCE_LKR },
      });
    }
  }

  // --- Raise alerts for any breached check (with per-kind cooldown) ---------
  const cooldownIso = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
  const cfg: TextLkConfig = {
    apiToken: TEXTLK_API_TOKEN,
    senderId: TEXTLK_SENDER_ID,
  };
  const alertsFired: string[] = [];

  for (const c of checks) {
    if (c.ok) continue;

    // De-dupe: skip if we already alerted this kind within the cooldown.
    const { data: recent } = await admin
      .from('system_alerts')
      .select('id')
      .eq('kind', c.kind)
      .gte('created_at', cooldownIso)
      .limit(1)
      .maybeSingle();
    if (recent) continue;

    // Try to text the admin (best-effort).
    let notified = false;
    if (ALERT_PHONE && TEXTLK_API_TOKEN) {
      try {
        const res = await sendSingle(cfg, ALERT_PHONE, `[Easyclz alert] ${c.message}`);
        notified = res.ok;
      } catch (e) {
        console.error('alert SMS failed', e);
      }
    }

    await admin.from('system_alerts').insert({
      kind: c.kind,
      severity: c.severity,
      message: c.message,
      details: c.details,
      notified,
    });
    alertsFired.push(c.kind);
  }

  return jsonResponse({
    ok: checks.every((c) => c.ok),
    checked_at: new Date().toISOString(),
    checks,
    alertsFired,
  });
});
