// Client wrapper for the log_audit edge function (U44, SRS §24.4).
// Best-effort: auditing must never block or break the user action, so callers
// should not await-throw — failures are swallowed and logged.
import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../constants';
import { getDeviceId } from '../device';
import { logger } from '../logger';

export type ClientAuditAction = 'backup.create' | 'backup.restore' | 'assistant.login';

interface LogAuditInput {
  action: ClientAuditAction;
  entityType?: string;
  entityId?: string | null;
  newValue?: unknown;
  oldValue?: unknown;
}

export async function logAudit(input: LogAuditInput, token: string): Promise<void> {
  if (!token) return;
  try {
    let deviceId: string | null = null;
    try { deviceId = await getDeviceId(); } catch { /* optional */ }

    await fetch(`${FUNCTIONS_URL}/log_audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: input.action,
        entity_type: input.entityType ?? 'system',
        entity_id: input.entityId ?? null,
        new_value: input.newValue ?? null,
        old_value: input.oldValue ?? null,
        device_id: deviceId,
      }),
    });
  } catch (e) {
    // Never let auditing break the user flow.
    logger.warn('logAudit failed (non-fatal)', e);
  }
}
