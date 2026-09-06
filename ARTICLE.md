# Building a Full Class-Management Platform, Mostly Solo, with Agentic AI

*An A-to-Z field report on what agentic coding is actually good at — and where I still had to do the thinking.*

---

## 1. What I built

**ClassS / Easyclz** is a class-management platform for private tuition teachers.
A teacher can take attendance, track fees, message students, share notes, run
online exams, and give students their own portal to log into. It is live at
easyclz.com.

It is not one app. It is four apps plus one shared backend:

| Part | Stack | Job |
|---|---|---|
| **Teacher app** | Expo / React Native | The app teachers use every day, on their phone, often with no signal |
| **Student portal** | Next.js | Students log in with an account and see their class, fees, notes, exams |
| **Super-admin** | Next.js | My internal dashboard: teacher accounts, subscription plans, metrics, website content |
| **Marketing site** | Next.js | The public site |
| **Backend** | Supabase (Postgres + RLS + Edge Functions + Vault) | One database, one set of rules, shared by all of the above |

Some numbers, so the scope is concrete:

- **~78,000 lines** of TypeScript and SQL (not counting dependencies or tests)
- **84 database migrations** — the schema was never "designed once", it grew
- **~70 Supabase Edge Functions** — auth, OTP, payments, push, exam logic
- **2 fully isolated environments** (dev and prod), each its own Supabase project

I am one developer. I could not have built this at this pace, alone, five years
ago. This article is about *how* the work actually happened.

---

## 2. The stack, and why

Nothing here is exotic. The point was to pick boring, well-documented tools so
the AI had a lot of prior knowledge to draw on.

- **Supabase** as the whole backend. Postgres for data, Row Level Security (RLS)
  for access control, Edge Functions (Deno) for anything that needs a secret or
  server-side logic, Vault for storing that secret. One database means one place
  to reason about correctness.
- **Next.js 14 (App Router)** for the two web apps. Server components, server
  actions, `@supabase/ssr` for auth cookies.
- **Expo / React Native** for the teacher app, because teachers are on phones and
  I needed one codebase for Android and iOS.
- **Drizzle ORM + expo-sqlite** for a real local database inside the teacher app.
  The app is offline-first: everything works with no connection, then syncs.
- **Stripe** for subscriptions.
- **TanStack Query, Zod, Zustand, Tailwind, shadcn/ui, react-hook-form** — the
  usual modern glue.
- **Web Push (VAPID)** for the student portal, **Expo Notifications** for the
  teacher app.

---

## 3. Architecture, in one page

### One backend, many clients

Every client talks to the same Postgres database. There is no separate "API
server" that I maintain. Instead:

- **Reads** go straight to Postgres through Supabase's auto-generated REST layer,
  and **RLS policies** decide what each user is allowed to see. A teacher sees
  only their students. A student sees only their own row. This is enforced by the
  database, not by app code I could forget to write.
- **Writes that need trust** — creating a teacher account, verifying an OTP,
  charging a card, sending an SMS, marking an exam — go through an **Edge
  Function** that holds the service-role key and does the checks itself.

That split (dumb reads guarded by RLS, sensitive writes behind functions) is the
backbone of the whole system.

### The teacher app is offline-first

This was the hardest part and the part I am most proud of.

- The app has its own **SQLite database** on the phone with its own migrations.
- Every screen reads and writes **local data only**. It is instant, and it works
  on a bus with no signal.
- A **sync engine** (`push`, `pull`, `queue`) runs in the background. It is
  **event-driven**: every local write schedules a sync, debounced, with a
  5-minute timer as a backstop in case an event is missed.
- Sync uses Postgres **upsert with primary-key conflict resolution** so the same
  change applied twice is harmless.
- The app also makes **encrypted backups** — AES-GCM, with a derived key — so a
  teacher can restore their data on a new phone.

### Environments

Two separate Supabase projects, `dev` and `prod`, so I can break things freely.
A shell script (`use-env.sh dev` / `use-env.sh prod`) swaps every app's local
config in one command.

---

## 4. How the work actually happened

This is the part people ask about. Here is the honest version.

### The loop

1. **I describe a feature** in plain language — "one student can be in many
   classes, each class has its own fee, and the teacher sets the fee per class."
2. **The agent explores the codebase** — reads the schema, the existing student
   code, the RLS policies — and comes back with a plan: which migration, which
   function, which screens.
3. **I push back.** The first plan is usually 70% right. I know the product and
   the users; the agent knows the code. The plan gets better because both of us
   are in it.
4. **It implements** — migration, function, client code, types — across all four
   apps at once, keeping them consistent.
5. **I test on a real device** and report what is wrong in plain words.
6. **It fixes.** Repeat until it ships.

### What changed versus coding alone

- **The schema could keep evolving.** 84 migrations is not a sign of bad
  planning. It is a sign that I never had to "get the data model right up front",
  because refactoring across a migration + 5 call sites + 3 apps stopped being
  scary.
- **Consistency across four apps became free.** Change a field name, and the
  teacher app, student app, admin app, and the shared types all move together in
  one pass.
- **Boilerplate stopped existing.** An Edge Function with auth, validation,
  rate-limiting and error handling is a 3-line request now.

### What did *not* change

- **I still own the product.** Every "one trial per device", "teachers can only
  mark attendance on the class's scheduled day inside its time window", "phone
  number must be unique per teacher" rule came from me understanding real
  teachers, not from the AI.
- **I still own security.** I decide what goes behind an Edge Function and what
  is safe with RLS. The AI implements that boundary; it does not get to choose
  where it is.
- **I still read the code.** Especially migrations and anything touching money or
  auth. Agentic speed is only safe if you keep reviewing.

---

## 5. Five hard problems and how they were solved

**Offline sync.** Covered above. The key insight, which took real
back-and-forth: make sync event-driven off local writes, make every sync
operation idempotent, and treat the phone's SQLite as the source of truth while
offline.

**One trial per device.** A teacher should not get a fresh free trial by making
a new account on a phone that already used one. Solved by making the trial
**account-based but device-aware** — a new account on a device that already
trialled starts with no trial. Enforced server-side.

**Attendance time windows.** A teacher can only mark attendance for **today**,
**only on the class's scheduled weekday**, and **only inside that class's time
window** — for manual marking, QR scanning, and extra classes. This is a product
rule with a lot of edge cases (midnight, multi-day classes) and it lives in the
database so no client can bypass it.

**Phone push without leaking a key.** The teacher app gets a push when something
changes. The database trigger that fires the push needs the service-role key,
but Supabase's managed Postgres role cannot hold custom settings. The fix:
store the key in **Supabase Vault**, read it from the trigger through
`vault.decrypted_secrets`, and keep the whole thing best-effort so a missing key
never rolls back the user's actual transaction.

**Exam anti-cheat.** Online exams are phased (join with a code, then the exam
opens), with event logging — tab switches, focus loss — written to an audit
table via a dedicated function.

---

## 6. Where agentic coding is strong, and where it is not

**Strong:**

- Cross-cutting changes — one concept, many files, keep them all consistent.
- Greenfield boilerplate with a known shape — CRUD, auth flows, forms, functions.
- Working *with* an existing codebase — it reads before it writes.
- Migrations and schema refactors, which used to be high-friction.
- Explaining a part of the system back to me when I forgot how it worked.

**Weaker — where I had to lead:**

- Deciding *what* to build and *which rule* is correct for real users.
- Drawing the security boundary.
- Catching a subtly wrong assumption in a plan before it becomes code.
- Anything where the requirement lives in my head and I under-specified it.

The mental model that worked: **the agent is a very fast senior engineer who
has never met my users and will not push back on a bad product decision.** My
job moved up a level — from typing to specifying, reviewing, and testing.

---

## 7. Skills this actually built

People assume AI tooling makes you a weaker engineer. My experience was the
opposite, because the bottleneck moved to the things that are actually hard:

- **System design.** When implementation is cheap, the design decisions are what
  matter, and you make far more of them.
- **Writing precise specifications.** A vague request gets a vague feature. I got
  much better at saying exactly what I mean.
- **Reading code fast.** I review more code now than when I wrote it all myself.
- **Security thinking.** RLS vs. function, what is a secret, what is public by
  design (the Supabase anon key is *meant* to be public; the service-role key
  must never ship).
- **Knowing my domain cold.** The AI cannot substitute for understanding how a
  tuition teacher actually runs their class. That knowledge became my main edge.

---

## 8. Shipping and open-sourcing

- **Dev/prod isolation from day one.** Two Supabase projects, one switch command.
  I never test against real users' data.
- **Secrets never in git.** Every app ships a `.env.example` with empty values.
  The real `.env` files (database password, service-role key, Stripe secret) are
  git-ignored and live only on my machine.
- **Open-sourced as a clean single commit.** The four apps had separate git
  histories with my commit emails scattered through them. To publish, I collapsed
  everything into one fresh repository — no old history to audit, no leaked
  emails, and a single root `.gitignore` that keeps every `.env` out.
- **Rotate anything that touched disk.** Even though nothing leaked, keys that
  sat in local files and backups get rolled after going public. Cheap insurance.

---

## 9. If you want to work this way

1. **Pick boring, well-documented tools.** The AI is better at Postgres and
   Next.js than at your favourite obscure framework.
2. **Keep one source of truth.** One database with real access rules beats a
   scatter of services you have to keep in sync by hand.
3. **Specify like you mean it.** Write the rule, the edge cases, the failure
   behaviour. The quality of the output tracks the quality of the ask.
4. **Review every migration and every line near auth or money.** Speed is only
   safe with review.
5. **Stay the product owner.** The AI writes the code. You decide what is worth
   building and what "correct" means. That is the job now, and it is a better
   job.

---

*ClassS / Easyclz is open source: https://github.com/hashanCB/Easyclzcom-*
