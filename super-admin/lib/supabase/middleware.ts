import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

export type SessionContext = {
  response: NextResponse;
  user: Awaited<ReturnType<ReturnType<typeof createServerClient>['auth']['getUser']>>['data']['user'];
  role: string | null;
};

/** Decode user_role from the JWT access token payload.
 *  custom_access_token_hook (U06) injects user_role into the JWT claims —
 *  it does NOT appear in user.app_metadata. */
function getRoleFromToken(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const claims = JSON.parse(decoded) as Record<string, unknown>;
    return (claims['user_role'] as string) ?? null;
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest): Promise<SessionContext> {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  // getUser() validates the session with Supabase Auth (secure)
  const { data: { user } } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    // getSession() gives us the raw access token to decode the JWT claims
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      role = getRoleFromToken(session.access_token);
    }
  }

  return { response, user, role };
}
