# admin-web

Super-admin web dashboard. Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui.

## Setup

```bash
# from repo root
pnpm install

# in another terminal — start Supabase locally
pnpm --filter @shared/db-schema supabase:start

# copy env, fill in NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY
# from the values printed by `supabase start`
cp apps/admin-web/.env.local.example apps/admin-web/.env.local

pnpm --filter admin-web dev
# → http://localhost:3000
```

## Layout

```
apps/admin-web/
├── app/                       App Router routes
│   ├── layout.tsx, page.tsx, globals.css, providers.tsx (React Query)
│   ├── login/page.tsx         (form lands in U09)
│   └── dashboard/page.tsx     (KPIs land in U10)
├── components/ui/             shadcn primitives (currently: button)
├── lib/
│   ├── supabase/
│   │   ├── client.ts          browser client (createBrowserClient)
│   │   ├── server.ts          server-component client (createServerClient + cookies)
│   │   ├── middleware.ts      session refresh helper for middleware.ts
│   │   ├── admin.ts           service-role client (server-only)
│   │   └── env.ts             validated env access
│   └── utils.ts               cn() helper
├── middleware.ts              auth gate: unauth → /login; non-admin → blocked from /dashboard
└── components.json            shadcn CLI config
```

## Adding shadcn components

```bash
pnpm --filter admin-web dlx shadcn@latest add card input label form
```

`components.json` is wired for `style: new-york`, `baseColor: slate`, alias `@/components/ui`.
