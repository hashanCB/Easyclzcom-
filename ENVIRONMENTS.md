# Environments — DEV vs PROD

Two fully separate Supabase projects so you can test freely without touching real users.

| | DEV (testing) | PROD (live users) |
|---|---|---|
| Supabase project | `easyclz-dev` | `ClassPay` |
| Project ref | `fxbfxfmtmmyuufqqddsu` | `kesssbvejyeefyaqjobk` |
| URL | https://fxbfxfmtmmyuufqqddsu.supabase.co | https://kesssbvejyeefyaqjobk.supabase.co |
| Region | ap-southeast-2 | ap-south-1 |
| Stripe | test mode | live mode (set at launch) |
| SMS | demo (TextLKDemo) | live sender (set at launch) |
| Super admin | superadmin@teachers.local / `SuperAdmin123!` | (your prod password) |

## Switch your local machine between them

```bash
./use-env.sh dev     # local apps talk to easyclz-dev  (safe testing)
./use-env.sh prod    # local apps talk to the live project
```

This rewrites the **local** env files only:
- `super-admin/.env.local`, `student-app/.env.local` ← `.env.dev` / `.env.prod`
- `teacher-app/.env.local` ← `.env.dev` (dev); removed for prod so the committed `.env` (= prod) is used.

After switching, restart dev servers. For Expo run `expo start -c` to clear the cache.

> The live web apps on **Vercel are not affected** — they read Vercel's own
> environment variables. `use-env.sh` only changes what your machine points at.

## Deploying a change to PROD (the safe rhythm)

1. Build + test the change on **DEV** (`./use-env.sh dev`, local servers + Expo preview).
2. When it works, ship to PROD:
   ```bash
   cd super-admin/packages/db-schema
   # migrations (PROD)
   set -a && source ../../.env && set +a
   npx supabase@2 db push                       # PROD (uses .env DB password)
   # functions (PROD)
   npx supabase@2 functions deploy <name> --use-api
   ```
3. `git push` → Vercel auto-deploys the web apps.
4. Teacher app: `eas update` (JS-only fix) or a new store build (native change).

**Golden rule:** nothing touches PROD until it worked on DEV. Migrations only ADD
columns/tables — never rename/drop — so old installed app versions keep working.

## Deploying to DEV

```bash
cd super-admin/packages/db-schema
TOK=$(security find-generic-password -s "Supabase CLI" -w); export SUPABASE_ACCESS_TOKEN=$(echo "${TOK#go-keyring-base64:}" | base64 -d)
# migrations
npx supabase@2 db push --db-url "postgresql://postgres.fxbfxfmtmmyuufqqddsu:<DB_PASSWORD>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
# functions
npx supabase@2 functions deploy <name> --project-ref fxbfxfmtmmyuufqqddsu --use-api
```

## Gotcha when creating a NEW Supabase project

The super-admin login reads the role from a JWT claim added by
`custom_access_token_hook`. The migration creates the function, but the hook
must be **enabled** in the project's Auth config or every login fails with
"Access denied. Super admin accounts only." Enable it:

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -w); export SUPABASE_ACCESS_TOKEN=$(echo "${TOK#go-keyring-base64:}" | base64 -d)
curl -s -X PATCH "https://api.supabase.com/v1/projects/<REF>/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"hook_custom_access_token_enabled":true,"hook_custom_access_token_uri":"pg-functions://postgres/public/custom_access_token_hook"}'
```

(Or Dashboard → Authentication → Hooks → Custom Access Token →
`public.custom_access_token_hook`.)

## Still TODO for a complete DEV environment

- [x] **SMS token:** `TEXTLK_API_TOKEN` + `TEXTLK_SENDER_ID=TextLKDemo` set on
      BOTH dev and prod (same text.lk account/gateway). Dev messages are
      prefixed `[DEV]`. OTP rate-limit is skipped in dev for fast testing.
- [ ] **Stripe test keys:** enter them in the dev super-admin Settings → Stripe Keys (test mode is already on).
### R2 file storage (dev vs prod)

| | DEV | PROD |
|---|---|---|
| Worker | `r2-worker-dev` | `r2-worker-prod` |
| Bucket | `class-dev` | `class-prod` |
| Validates tokens from | easyclz-dev | ClassPay (prod) |

Config lives in `/Users/Hashan/Class/apps/r2-worker/wrangler.toml` (`[env.dev]` /
`[env.prod]`). The teacher app + dev edge functions already point at
`r2-worker-dev`. **Deploy the dev worker once** (the stored wrangler token had
expired — re-login first):

```bash
cd /Users/Hashan/Class/apps/r2-worker
npx wrangler login          # token needs R2 + Workers permissions
./setup-dev.sh              # creates class-dev bucket, deploys, sets secrets
```

Deploy/redeploy **prod** worker after worker code changes:
`npx wrangler deploy --env prod`

Until the dev worker is deployed, dev file uploads fail cleanly (they no longer
write to the prod bucket).
