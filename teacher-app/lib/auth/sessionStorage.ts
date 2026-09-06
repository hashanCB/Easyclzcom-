// Persistence for a Supabase session, split across several SecureStore keys.
//
// Why not one key: native SecureStore caps a single value at ~2048 bytes. The
// full session JSON (access JWT + refresh token + user object) can cross that
// limit, which silently fails to persist on Android → the user gets logged out
// at random. Storing the big tokens in their own keys keeps every value
// comfortably under the cap.
//
// Backward compatible: older builds wrote the whole session under one key
// (the base key). loadSession() falls back to it, and the next save migrates to
// the split layout and removes the legacy blob. Shared by the teacher and
// assistant auth stores — each passes its own base key.

import type { SupabaseSession } from '../api/auth';
import { storage } from '../storage';

interface SessionMeta {
  expires_at: number;
  token_type: string;
  user: SupabaseSession['user'];
}

const keysFor = (base: string) => ({
  legacy: base, // old single JSON blob
  access: `${base}_at`,
  refresh: `${base}_rt`,
  meta: `${base}_meta`,
});

/** Persist a session across split keys; clears the legacy combined key. */
export async function saveSession(baseKey: string, session: SupabaseSession): Promise<void> {
  const k = keysFor(baseKey);
  const meta: SessionMeta = {
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user,
  };
  await Promise.all([
    storage.setItem(k.access, session.access_token),
    storage.setItem(k.refresh, session.refresh_token),
    storage.setItem(k.meta, JSON.stringify(meta)),
    // Drop the old single-blob key so it can't shadow the split values later.
    storage.deleteItem(k.legacy),
  ]);
}

/** Load the session, migrating transparently from the legacy combined key. */
export async function loadSession(baseKey: string): Promise<SupabaseSession | null> {
  const k = keysFor(baseKey);
  const [accessToken, refreshToken, metaRaw] = await Promise.all([
    storage.getItem(k.access),
    storage.getItem(k.refresh),
    storage.getItem(k.meta),
  ]);

  if (accessToken && refreshToken && metaRaw) {
    try {
      const meta = JSON.parse(metaRaw) as SessionMeta;
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: meta.expires_at,
        token_type: meta.token_type,
        user: meta.user,
      };
    } catch {
      return null;
    }
  }

  // Fallback: last signed in on an older build (single JSON blob).
  const legacy = await storage.getItem(k.legacy);
  if (!legacy) return null;
  try {
    return JSON.parse(legacy) as SupabaseSession;
  } catch {
    return null;
  }
}

/** Remove every session key, including the legacy one. */
export async function clearSession(baseKey: string): Promise<void> {
  const k = keysFor(baseKey);
  await Promise.all([
    storage.deleteItem(k.access),
    storage.deleteItem(k.refresh),
    storage.deleteItem(k.meta),
    storage.deleteItem(k.legacy),
  ]);
}
