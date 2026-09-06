# Environments — DEV vs PROD

Run two fully separate Supabase projects so you can test freely without touching
real users.

| | DEV (testing) | PROD (live users) |
|---|---|---|
| Supabase project | your dev project | your prod project |
| Project ref | `<DEV_PROJECT_REF>` | `<PROD_PROJECT_REF>` |
| URL | `https://<DEV_PROJECT_REF>.supabase.co` | `https://<PROD_PROJECT_REF>.supabase.co` |
| Stripe | test mode | live mode |
| SMS | demo sender | live sender |
| Super admin | a dev-only account you create | a separate prod account |

> Use different super-admin credentials on each project, and never reuse the
> seed/demo password (`supabase/seed.sql`) on a hosted project.

## Switch your local machine between them

```bash
./use-env.sh dev     # local apps talk to the dev project (safe testing)
./use-env.sh prod    # local apps talk to the live project
```

This rewrites the **local** env files only:
- `super-admin/.env.local`, `student-app/.env.local` ← `.env.dev` / `.env.prod`
- `teacher-app/.env.local` ← `.env.dev` (dev); removed for prod so the local `.env` (= prod) is used.

After switching, restart dev servers. For Expo run `expo start -c` to clear the cache.

> Live web apps on **Vercel are not affected** — they read Vercel's own
> environment variables. `use-env.sh` only changes what your machine points at.

## Deploying a change to PROD (the safe rhythm)

1. Build + test the change on **DEV** (`./use-env.sh dev`, local servers + Expo preview).
2. When it works, ship to PROD:
   ```bash
   cd super-admin/packages/db-schema
   # migrations (PROD) — reads the DB password from your local .env
   set -a && source ../../.env && set +a
   npx supabase@2 db push
   # functions (PROD)
   npx supabase@2 functions deploy <name> --use-api
   ```
3. `git push` → Vercel auto-deploys the web apps.
4. Teacher app: `eas update` (JS-only fix) or a new store build (native change).

**Golden rule:** nothing touches PROD until it worked on DEV. Migrations only ADD
columns/tables — never rename/drop — so old installed app versions keep working.

## Deploying to DEV

```bash
export SUPABASE_ACCESS_TOKEN=<your-access-token>
cd super-admin/packages/db-schema
# migrations
npx supabase@2 db push --db-url "postgresql://postgres.<DEV_PROJECT_REF>:<DB_PASSWORD>@<region>.pooler.supabase.com:5432/postgres"
# functions
npx supabase@2 functions deploy <name> --project-ref <DEV_PROJECT_REF> --use-api
```

## Gotcha when creating a NEW Supabase project

The super-admin login reads the role from a JWT claim added by
`custom_access_token_hook`. The migration creates the function, but the hook
must be **enabled** in the project's Auth config or every login fails with
"Access denied. Super admin accounts only." Enable it:

```bash
export SUPABASE_ACCESS_TOKEN=<your-access-token>
curl -s -X PATCH "https://api.supabase.com/v1/projects/<REF>/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"hook_custom_access_token_enabled":true,"hook_custom_access_token_uri":"pg-functions://postgres/public/custom_access_token_hook"}'
```

(Or Dashboard → Authentication → Hooks → Custom Access Token →
`public.custom_access_token_hook`.)

## SMS

Set `TEXTLK_API_TOKEN` + `TEXTLK_SENDER_ID` on both dev and prod. Dev messages are
prefixed `[DEV]` and the OTP rate-limit is skipped in dev for fast testing.

## R2 file storage (dev vs prod)

| | DEV | PROD |
|---|---|---|
| Worker | `r2-worker-dev` | `r2-worker-prod` |
| Bucket | `class-dev` | `class-prod` |
| Validates tokens from | dev project | prod project |

The worker config lives in a separate `r2-worker` project (`[env.dev]` /
`[env.prod]` in its `wrangler.toml`). The teacher app + dev edge functions point
at `r2-worker-dev`.

```bash
npx wrangler login                 # token needs R2 + Workers permissions
npx wrangler deploy --env dev
npx wrangler deploy --env prod
```
