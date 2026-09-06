# ClassS / Easyclz

Open-source class-management platform for tuition teachers: attendance, fees,
student communication, notes, exams and a public student portal.

The repo is a monorepo of four independent apps plus a shared Supabase backend.

| App | Path | Stack | What it is |
|-----|------|-------|------------|
| Teacher app | [`teacher-app/`](teacher-app) | Expo / React Native | Mobile app teachers use day to day |
| Student portal | [`student-app/`](student-app) | Next.js | Web app students log into with a class code |
| Super admin | [`super-admin/`](super-admin) | Next.js | Internal dashboard: teacher accounts, plans, website content |
| Marketing site | [`easyclz.com/`](easyclz.com) | Next.js | Public site at easyclz.com |
| Backend | [`super-admin/packages/db-schema/supabase/`](super-admin/packages/db-schema/supabase) | Supabase | Postgres schema, RLS policies, Edge Functions |

## Architecture

A full top-down walkthrough — context diagram, the four clients, the Supabase
backend, the identity/role model, the read/write split, data model, edge
functions, offline sync, notifications, payments, online exams, environments and
the security model — is in [`docs/ARCHITECTURE.html`](docs/ARCHITECTURE.html).
There is also a field report on building it with agentic AI: [`ARTICLE.md`](ARTICLE.md).

## Getting started

Each app is self-contained. Pick one:

```bash
cd student-app        # or super-admin, easyclz.com
npm install
cp .env.example .env.local   # fill in your own Supabase project values
npm run dev
```

```bash
cd teacher-app
npm install
cp .env.example .env
npm start
```

You will need your own [Supabase](https://supabase.com) project. Apply the
migrations in `super-admin/packages/db-schema/supabase/migrations/` and deploy
the functions alongside them.

## Environments

The project runs against two separate Supabase projects (dev and prod). See
[`ENVIRONMENTS.md`](ENVIRONMENTS.md) and `use-env.sh` for how local machines
switch between them.

## Configuration

No secrets are committed. Every app ships a `.env.example`; copy it and supply
your own values. `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` keys (Supabase URL and anon
key) are public by design and protected by row-level security. Server-only keys
(service-role key, Stripe secret, SMS provider keys) must never be committed.

## License

[MIT](LICENSE) © 2026 Hashan Chanaka
