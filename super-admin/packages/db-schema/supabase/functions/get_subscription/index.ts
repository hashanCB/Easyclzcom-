// =============================================================================
// get_subscription — returns the teacher's current subscription status
// =============================================================================
// Input:  (none — teacher identified via JWT)
// Output: { status, plan_code, current_period_end, cancel_at_period_end } | null

import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/errors.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse({ code: 'invalid_input', message: 'POST only' });
  }

  const caller = userClient(req);
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) {
    return errorResponse({ code: 'unauthorized', message: 'Not authenticated' });
  }

  const admin = adminClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, plan_code, current_period_start, current_period_end, cancel_at_period_end, cancelled_at')
    .eq('teacher_id', user.id)
    .maybeSingle();

  if (!sub) {
    return jsonResponse({ subscription: null });
  }

  // A 'trialing' row stays 'trialing' in the DB even after the trial date
  // passes, so an expired trial must not count as Pro. Mirror the client's
  // hasActiveAccess() check: trialing is only Pro while still inside the window.
  const trialStillValid =
    sub.status === 'trialing' &&
    (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now());

  return jsonResponse({
    subscription: {
      status: sub.status,
      plan_code: sub.plan_code,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
      cancelled_at: sub.cancelled_at,
      is_pro: sub.status === 'active' || trialStillValid,
    },
  });
});
