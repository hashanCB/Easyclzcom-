# Edge Functions

Deno-based Supabase Edge Functions. Each subdirectory deploys independently.

## Layout

```
functions/
├── _shared/             # imported by every function (not deployed standalone)
│   ├── cors.ts
│   ├── errors.ts
│   ├── hash.ts          # SHA-256 token hash + username→synthetic-email
│   ├── random.ts        # token + password generators (Deno crypto.getRandomValues)
│   ├── role.ts          # extract caller role from JWT
│   ├── schema.ts        # Zod input schemas
│   └── supabase.ts      # adminClient() + userClient(req)
├── create_teacher/      # super-admin only — issue username/password/token
├── activate_teacher/    # first-time login + token bind to single device
├── login_teacher/       # subsequent login + duplicate-device detection
└── change_password/     # teacher/assistant self-service password change
```

## Local dev

```sh
# from repo root
pnpm --filter @shared/db-schema supabase:start

# serve all functions with hot reload
supabase functions serve --env-file ../../.env

# or one at a time
supabase functions serve create_teacher --no-verify-jwt --env-file ../../.env
```

## Required environment variables

Functions expect these in their runtime env (Supabase sets the first three
automatically when deployed; for local dev they come from your `.env`):

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Used by `userClient()` for JWT-aware reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by `adminClient()` — bypasses RLS |

## Deploy

```sh
supabase functions deploy create_teacher
supabase functions deploy activate_teacher
supabase functions deploy login_teacher
supabase functions deploy change_password
```

## Endpoints (after deploy)

```
POST {SUPABASE_URL}/functions/v1/create_teacher
POST {SUPABASE_URL}/functions/v1/activate_teacher
POST {SUPABASE_URL}/functions/v1/login_teacher
POST {SUPABASE_URL}/functions/v1/change_password
```

## Error shape

Every error follows:

```json
{ "error": { "code": "duplicate_token", "message": "...", "details": {} } }
```

Codes: `invalid_input | unauthorized | forbidden | not_found | conflict | duplicate_token | wrong_credentials | inactive_teacher | rate_limited | internal`. See `_shared/errors.ts`.
