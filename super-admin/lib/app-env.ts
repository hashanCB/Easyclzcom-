// Detects whether the admin panel is pointed at the DEV or PROD Supabase
// project, derived from the Supabase URL so it is always correct — no separate
// flag to keep in sync. Add new dev project refs here if you create more.

const DEV_PROJECT_REFS = ['fxbfxfmtmmyuufqqddsu']; // easyclz-dev

export type AppEnv = 'dev' | 'prod';

export function getAppEnv(): AppEnv {
  // Explicit override wins, if ever set.
  const explicit = process.env.NEXT_PUBLIC_APP_ENV;
  if (explicit === 'dev' || explicit === 'prod') return explicit;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return DEV_PROJECT_REFS.some((ref) => url.includes(ref)) ? 'dev' : 'prod';
}
