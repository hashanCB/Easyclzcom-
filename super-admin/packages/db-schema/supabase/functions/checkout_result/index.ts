// =============================================================================
// checkout_result — landing target after Stripe Checkout (success or cancel)
// =============================================================================
// Stripe redirects the browser here. We bounce straight back into the app via
// the return URL the app supplied when starting checkout (passed through as the
// `return` query param). We cannot render an HTML page here: Supabase forces
// `content-type: text/plain` on the functions domain (anti-phishing), so any
// HTML body would show as raw source. A 302 redirect is not subject to that.
//
// The return URL must match the app's runtime scheme — exp://… in Expo Go,
// teacher-app://… in a standalone build — which is why the app computes it
// (Linking.createURL) and sends it, rather than us hardcoding a scheme here.
//
// The actual Pro status is set by the stripe_webhook function, not here. When
// the app comes back to the foreground it re-checks status and unlocks itself.

// Fallback for older app builds that don't pass a return URL: the standalone
// app's custom scheme. Override via env if the scheme ever changes.
const FALLBACK_SCHEME = Deno.env.get('APP_RETURN_SCHEME') ?? 'teacher-app';

Deno.serve((req) => {
  const url = new URL(req.url);
  const result = url.searchParams.get('result') === 'success' ? 'success' : 'cancel';
  const ret = url.searchParams.get('return');

  const base = ret && /^[a-z][a-z0-9+.-]*:\/\//i.test(ret)
    ? ret
    : `${FALLBACK_SCHEME}://`;
  // Carry the outcome onto the deep link so the app can show a thank-you on
  // success (vs. just reopening on cancel). Works for any scheme/existing query.
  const sep = base.includes('?') ? '&' : '?';
  const target = `${base}${sep}checkout=${result}`;

  return new Response(null, {
    status: 302,
    headers: { location: target },
  });
});
