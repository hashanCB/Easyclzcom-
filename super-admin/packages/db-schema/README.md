# @shared/db-schema

Supabase migrations, seed data, and edge functions for the teacher-class-management system.

This package owns:
- `supabase/config.toml` — local Supabase stack config (auth, db, edge runtime).
- `supabase/migrations/` — versioned SQL migrations (filled in U06).
- `supabase/seed.sql` — local-dev seed data (filled in U06).
- `supabase/functions/` — edge functions (filled in U07).

## Prerequisites

1. **Supabase CLI** — install once per machine:
   ```sh
   brew install supabase/tap/supabase     # macOS
   # or: npm i -g supabase
   ```
2. **Docker Desktop** — required by `supabase start` for the local Postgres + GoTrue stack.
3. **Supabase account** — sign up at https://supabase.com and create the cloud project named `teacher-class-management` (the user must do this; never share account credentials with Claude).

## First-time setup

From the repo root:

```sh
# 1. Start local stack
pnpm --filter @shared/db-schema supabase:start

# 2. Link to the cloud project (one-time, requires `supabase login` first)
pnpm --filter @shared/db-schema link --project-ref <your-project-ref>

# 3. Pull current cloud schema (no-op until U06)
pnpm --filter @shared/db-schema db:pull
```

Once `supabase start` finishes it prints API URL, anon key, and service-role key — copy those into `.env` (see root `.env.example`).

## Day-to-day

| Command | What it does |
|---|---|
| `pnpm --filter @shared/db-schema supabase:start` | Boots local Supabase stack (Postgres, GoTrue, Realtime, Storage, Studio). |
| `pnpm --filter @shared/db-schema supabase:stop` | Stops the local stack. |
| `pnpm --filter @shared/db-schema supabase:status` | Prints local URLs + keys. |
| `pnpm --filter @shared/db-schema migration:new <name>` | Creates a new migration file. |
| `pnpm --filter @shared/db-schema supabase:reset` | Drops local DB, replays migrations, re-runs seed. |
| `pnpm --filter @shared/db-schema db:diff <name>` | Diffs the local schema against last migration and writes a new file. |
| `pnpm --filter @shared/db-schema db:push` | Pushes local migrations to the linked cloud project. |
| `pnpm --filter @shared/db-schema gen:types` | Regenerates TS types from the local DB. |

## Auth model (U05 → U07)

- Email + password auth on the `auth.users` table (Supabase default).
- `enable_signup = false` — accounts are created only by edge functions in U07 (super-admin → teacher; teacher → assistant; teacher → student).
- A custom-access-token JWT hook (`auth.custom_access_token_hook`, created in U06) injects a `role` claim — one of `super_admin | teacher | assistant | student`. RLS policies branch on this claim.
- Token activation flow (single-device bind) lives in edge functions (U07).
