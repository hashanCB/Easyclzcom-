# ClassPay — Software Requirements (As-Built)

This document is kept **in sync with the current code**. It covers the modules
that have changed most recently and where the implementation had moved ahead of
the older SRS: **Subscriptions & Trial**, **Stripe Checkout & Return**,
**SMS Gateway (text.lk)**, and **Teacher Self-Service Password Reset**.

Apps referenced:
- `teacher-app` — React Native / Expo app used by teachers.
- `super-admin` — Next.js admin + Supabase edge functions + DB schema.

Last reconciled: 2026-06-08.

---

## 1. Subscriptions & Trial

### 1.1 Plans
The teacher app shows three plans on the paywall (display only — the real charge
comes from Stripe):

| Code | Name | Max students | Display price |
|------|------|--------------|---------------|
| `starter` | Starter | 50 | $1 /mo |
| `pro` | Pro | 200 | $21 /mo |
| `institute` | Institute | unlimited | $51 /mo |

### 1.2 Trial creation
- On teacher registration (`register_teacher_confirm`), a `subscriptions` row is
  created with `status = 'trialing'` and `current_period_end = now + trial_days`.
- `trial_days` is configurable via `app_settings.trial_days` (default **14**).

### 1.3 Access gating (REQ-SUB-1)
A teacher has active access when **either**:
- `status = 'active'`, **or**
- `status = 'trialing'` **and** `current_period_end` is in the future.

A `trialing` row stays `trialing` in the DB even after the date passes, so the
expiry **must** be checked against `current_period_end`, never `status` alone.
This rule is implemented identically on the client (`hasActiveAccess`) and the
server (`get_subscription.is_pro`, `create_checkout_session` guard).

### 1.4 Paywall (REQ-SUB-2)
- When access has lapsed, the app shows a full-screen, non-dismissible paywall
  (`Paywall.tsx`). The only exits are: pay, or sign out.
- The paywall is gated on `subscription !== null && !hasActiveAccess(...)`, so it
  never flashes before the first status fetch and never locks out an offline user
  (a failed fetch leaves `subscription` null).

### 1.5 Pro feature gating (REQ-SUB-3)
`is_pro` (from `get_subscription`) gates Pro-only features: cloud sync,
assistants, chat, notes, messages, restore. An **expired trial must report
`is_pro = false`** so background sync stops when the trial lapses.

### 1.6 Checkout eligibility (REQ-SUB-4)
`create_checkout_session` rejects with `409 conflict "Already subscribed to Pro"`
only when the teacher still has genuine access (`active`, or `trialing` and not
yet expired). An **expired-trial teacher is allowed to check out** — this was the
defect where expired trials were wrongly blocked from paying.

---

## 2. Stripe Checkout & Return

### 2.1 Starting checkout (REQ-PAY-1)
- App calls `create_checkout_session` with `{ plan_code, return_url }`.
- `return_url` is computed by the app via `Linking.createURL('/')`, so it matches
  the runtime: `exp://…` in Expo Go, `teacher-app://…` in a standalone build.
- The function creates/reuses a Stripe customer and returns a Checkout URL, which
  the app opens with `Linking.openURL`.

### 2.2 Return landing (REQ-PAY-2)
- Stripe redirects the browser to `checkout_result` with
  `?result=success|cancel&return=<app return_url>`.
- Supabase forces `Content-Type: text/plain` on the functions domain (anti-abuse),
  so an HTML page would render as raw source. Therefore `checkout_result`
  responds with **HTTP 302** to `<return_url>?checkout=success|cancel`, bouncing
  the browser back into the app. A `teacher-app://` fallback is used if no return
  URL was supplied (older app builds).

### 2.3 Post-payment behaviour (REQ-PAY-3)
- The app handles the `?checkout=…` deep link (`(app)/_layout.tsx`):
  - `success` → shows the **"You're subscribed" thank-you** modal
    (`CheckoutThankYou.tsx`), not the upgrade ad, and re-polls subscription
    status at 0s / 2s / 5s to catch the webhook flipping the account to Pro.
  - `cancel` → just re-checks status (paywall stays if still unpaid).
- The upgrade ad (`UpgradeAd.tsx`) is suppressed whenever the thank-you is shown
  and for any Pro user.
- Actual Pro activation is performed by `stripe_webhook`, not by `checkout_result`.

---

## 3. SMS Gateway (text.lk)

The SMS provider is **text.lk** (previously QuickSend.lk, now fully removed).

### 3.1 Adapter (REQ-SMS-1)
`_shared/textlk.ts` is the single gateway adapter:
- **Send:** `POST https://app.text.lk/api/v3/sms/send` with JSON
  `{ recipient, sender_id, type: 'plain', message }`.
- **Balance:** `GET https://app.text.lk/api/v3/balance` → `data.remaining_balance` (LKR).
- **Auth:** `Authorization: Bearer <TEXTLK_API_TOKEN>`.
- All v3 responses share `{ status: 'success' | 'error', message, data }`; a send
  is successful when HTTP 2xx **and** `status === 'success'`.

### 3.2 Recipient format (REQ-SMS-2)
The adapter normalises any input to text.lk's `94XXXXXXXXX` form (accepts `07…`,
`+94…`, `94…`), so call sites can keep passing local numbers.

### 3.3 Bulk (REQ-SMS-3)
text.lk has no batch-different endpoint, so `sendBulkDifferent` sends messages
one-by-one and reports a single combined outcome (callers apply one status per
batch, unchanged from before).

### 3.4 Sender ID & demo mode (REQ-SMS-4)
- `getSmsSender` returns `TextLKDemo` while `app_settings.sms_demo_mode` is not
  `'false'` (demo on by default).
- In live mode it uses `app_settings.sms_sender_name`, falling back to the
  `TEXTLK_SENDER_ID` env var, then `TextLKDemo`.

### 3.5 Configuration (REQ-SMS-5)
- Secret: `TEXTLK_API_TOKEN` (required). Optional: `TEXTLK_SENDER_ID`.
- The old `QUICKSEND_EMAIL` / `QUICKSEND_API_KEY` / `QUICKSEND_SENDER_ID` secrets
  and the `quicksend.ts` adapter have been removed.

### 3.6 Consumers
All SMS-sending functions use this adapter: `send_sms`, `dispatch_reminders`,
`send_payment_receipt`, `admin_resend_sms`, `admin_send_phone_otp`,
`request_phone_change`, `register_teacher_request`, `request_password_reset_otp`
(students), `request_teacher_password_reset_otp` (teachers), and `health_check`
(balance/alerts). Cost per message is captured by diffing the account balance
before/after a dispatch; `provider` is recorded as `'textlk'`.

---

## 4. Teacher Self-Service Password Reset

A teacher who forgets their password can reset it themselves via phone OTP,
without admin involvement. (Admin reset via `reset_teacher_password` still exists
as a fallback.) Teachers are identified by **username** (unique); the code is sent
to the **phone on file**.

### 4.1 Data (REQ-PWR-1)
- Table `teacher_password_reset_otps` (migration
  `20260608120000_teacher_password_reset_otps.sql`): one row per teacher
  (`UNIQUE(teacher_id)`), `otp_hash`, `expires_at`, `created_at`, RLS enabled
  (service-role only).

### 4.2 Request code (REQ-PWR-2) — `request_teacher_password_reset_otp`
- Input `{ username }`. Public (no JWT).
- Looks up an active, non-deleted teacher by username. **Always returns `{ ok:true }`**
  to avoid username enumeration.
- Rate limit: **1 request per 60 seconds** per teacher.
- Generates a 6-digit OTP, stores its SHA-256 hash with a **10-minute** TTL, and
  SMSes the plaintext code to the teacher's phone via text.lk.

### 4.3 Verify code (REQ-PWR-3) — `verify_teacher_password_reset_otp`
- Input `{ username, otp }`. Public (no JWT).
- Validates the code is correct and not expired **without consuming it**, so the
  app can confirm the code before asking for a new password.
- Errors: `wrong_credentials` (bad code / unknown user), `not_found`
  (no request / expired — expired rows are deleted).

### 4.4 Set new password (REQ-PWR-4) — `confirm_teacher_password_reset`
- Input `{ username, otp, new_password }` (min 8 chars). Public (no JWT).
- Re-verifies the OTP, then sets the password via Supabase Auth
  (`auth.admin.updateUserById`), and deletes the OTP row.

### 4.5 App flow (REQ-PWR-5) — `(auth)/forgot-password.tsx`
Three steps, each its own keyed subtree so inputs never get reused across steps:
1. **Username** → "Send code" (calls REQ-PWR-2).
2. **Verify code** → 6-digit entry verified server-side (REQ-PWR-3) before
   proceeding. A **2-minute resend countdown** is shown ("You can resend the code
   in m:ss"); when it reaches 0:00 a **"Resend code"** action appears (re-issues a
   code and restarts the timer). The resend window (120s) is deliberately longer
   than the server's 60s rate limit.
3. **New password** + confirm → "Reset password" (REQ-PWR-4) → returns to login
   with the username pre-filled.

The login screen exposes the flow via a **"Forgot password?"** link.

### 4.6 Notes
- The visible 2-minute timer is a **resend cooldown**; the code itself stays valid
  for 10 minutes (REQ-PWR-2).
- The `teachers.phone` column is not unique, which is why reset is keyed on the
  unique `username` and the code is delivered to that teacher's stored phone.
