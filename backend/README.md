# TaskBuddy Backend

REST API for **TaskBuddy**, a Philippine home-services marketplace: **clients**
post jobs in five categories (Plumbing, Cleaning, Handyman, Manicure, Pedicure)
and **providers** apply to them. If nobody is hired before the job's urgency
timeout, an ML **recommendation engine** scores eligible providers and invites
the best matches.

The full data-schema and product spec lives in [`BACKEND_SCHEMA.md`](./BACKEND_SCHEMA.md)
— that document is the source of truth for tables, lifecycle rules, and ML features.

> **🚀 Deployed instance:** the backend is live at
> **https://taskbuddy-1d48.onrender.com** — frontend developers can build
> against it directly, no local backend setup required (see
> [Base URL](#base-url) below). Status page: <https://taskbuddy-1d48.onrender.com/> ·
> JSON health: <https://taskbuddy-1d48.onrender.com/health>

## Architecture

```
mobile / web ──REST──► backend/ (NestJS, :3000)
                          │  verifies Supabase JWTs
                          │  reads/writes Postgres via service-role key
                          │  cron (every minute): urgency-timeout poller
                          ▼
                     Supabase (Postgres + Auth + RLS)
                          ▲
                          │  POST /score (14 features per pair → probabilities)
                     ml-service/ (FastAPI — Random Forest rf-a-v1)
```

- **Supabase** provides Postgres (schema, triggers, RLS) and Auth (signup/login → JWTs).
- **NestJS** is the only thing the frontends talk to (besides token refresh, which
  also goes through it). It enforces authorization in code and owns all DB writes.
- **ml-service** is a stateless scorer serving the trained **Random Forest
  `rf-a-v1`** (0.82 accuracy / 0.88 ROC-AUC holdout). Deployed at
  <https://taskbuddy-ml-service.onrender.com> — see
  [`../ml-service/README.md`](../ml-service/README.md).

### The matching flow

1. Client posts a job (`urgency`: urgent / normal / flexible).
2. Providers browse and apply organically; the client accepts **exactly one**.
3. If nobody is accepted before the urgency timeout (**5 / 10 / 15 min**), the
   scheduler moves the job to `recommending`, computes 14 ML features per eligible
   provider (SQL function `fn_job_provider_features`), scores them via ml-service,
   stores the ranked results, and notifies the **top 8** providers.
4. Recommended providers apply like anyone else; the client still picks one.
5. Job proceeds `assigned → in_progress → completed`, then the client leaves a
   review. Every scored candidate is labeled (`was_hired`) for future retraining.

Job lifecycle: `open → recommending → assigned → in_progress → completed`
(plus `cancelled` from any pre-completion state, and `expired` after 24 h unassigned).

## Setup

> Building a frontend? You can skip this whole section and use the
> [deployed instance](#base-url). Local setup is only needed when working on
> the backend itself.

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Apply **every** migration in [`supabase/migrations/`](./supabase/migrations) **in order**
   (0001 → 0023), either by pasting each file into the SQL Editor or with the CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   | File | Contents |
   |---|---|
   | `0001_enums_and_tables.sql` | enums, all 11 tables, indexes |
   | `0002_functions_and_triggers.sql` | signup trigger, lifecycle triggers, cached-stat triggers, `haversine_km`, `fn_job_provider_features` |
   | `0003_rls.sql` | Row Level Security policies |
   | `0004_seed.sql` | 5 categories + urgency timeouts |
   | `0005_admin_role.sql` | adds `'admin'` to `user_role` enum + `admin_user_overview` view (profiles ⋈ `auth.users` email, service-role only) for the Admin Dashboard (#29/#31/#32). Admins can't self-register — promote a user manually after this migration (see the comment at the end of the file). |
   | `0006_wallet_chat_calendar.sql` | app-support subsystems (`wallet_transactions`, `conversations` + `messages`, `bookings`) backing the mobile Wallet/Chat/Calendar screens. Additive; not part of the ML flow. See `BACKEND_SCHEMA.md` §15. |
   | `0007_job_pricing_schedule_photos.sql` | `jobs.budget`, `jobs.scheduled_at`, `jobs.photo_urls`; creates the public `job-photos` Storage bucket; extends `handle_application_accepted()` to auto-create the `bookings` row. See `BACKEND_SCHEMA.md` §16. |
   | `0008_provider_verifications.sql` | `provider_verifications` + `provider_profiles.is_verified`; creates the **private** `verification-docs` Storage bucket. Backs the admin Verification queue. See `BACKEND_SCHEMA.md` §17. |
   | `0009_escrow_and_disputes.sql` | `escrow_transactions` + `disputes`. Backs the admin Transactions page and the mobile dispute screen. See `BACKEND_SCHEMA.md` §18. |
   | `0010_wallet_txn_kind.sql` | `wallet_transactions.kind`, so platform revenue counts payouts without also counting escrow refunds. Split out of 0009 because that file had already been applied. Safely re-runnable. |
   | `0011_avatars_and_user_settings.sql` | public `avatars` Storage bucket plus per-user notification and display settings. |
   | `0012_push_device_tokens.sql` | Expo push-device tokens and notification delivery metadata. |
   | `0013_stripe_payments_and_identity.sql` | Stripe PaymentIntent/Checkout idempotency and provider Stripe Identity verification support. |
   | `0014_admin_console_followups.sql` | timed suspensions, `admin_actions`, and expanded admin-console data. |
   | `0015_signup_consents_and_sp_category.sql` | signup consent records and provider service-category support. |
   | `0016_google_signup_pending.sql` | pending-profile state for Google signups. |
   | `0017_maintenance_mode.sql` | platform maintenance setting and wallet-ledger admin support. |
   | `0018_job_confirmed_status.sql` | `confirmed` job status and assignment lifecycle updates. |
   | `0019_job_tasks_and_verification_storage_rls.sql` | job checklists and verification-storage RLS policies. |
   | `0020_admin_search_functions.sql` | service-role-only SQL RPCs for paginated admin booking, activity, and escrow search. |
   | `0021_recovery_credit_kind.sql` | adds `'recovery_credit'` to `wallet_txn_kind`, the tag an admin-issued trust credit will carry once that endpoint exists (see `docs/backend-handoff-recovery-vouchers.md`). Safely re-runnable. |
   | `0021_notification_announcement_type.sql` | `notification_type` gains `'announcement'` (admin broadcast) and `'wallet_update'` (withdrawal settled/declined). |
   | `0022_account_deletion_and_email_otp.sql` | `profiles.deleted_at` (soft delete) and `profiles.email_verified_at`; `admin_user_overview` re-created to expose `deleted_at`. |
   | `0023_withdrawal_requests_and_commission.sql` | withdrawal review columns on `wallet_transactions`, `platform_settings.commission_rate` (default 0), `escrow_transactions.commission_amount`. |

   > Migrations 0008 and 0009 each run `alter type notification_type add value`.
   > Postgres allows this inside a transaction as long as the new value isn't
   > *used* in the same transaction — neither file inserts a notification, so
   > applying each file in one go is safe.

   > **0018 and 0019 must be applied as two separate runs.** 0018 adds
   > `'confirmed'` to the `job_status` enum and 0019 *uses* that value in a
   > CHECK constraint, which the same rule forbids inside one transaction (and
   > the Supabase SQL editor runs a pasted script as one transaction). Run
   > 0018, let it commit, then run 0019. `supabase db push` applies each file
   > in its own transaction and needs no special handling. Apply **0020 only
   > after 0019**: it depends on the complete jobs, escrow, and admin schema
   > established by the preceding migrations. 0021 has no such ordering
   > requirement — it's a standalone enum addition — but comes last since
   > it's the most recently added.
   >
   > The API code that ships with these migrations reads `job_tasks` on every
   > job query, so **apply 0019 before deploying the API**. Out of order, job
   > endpoints fail with PostgREST's "Could not find a relationship between
   > 'jobs' and 'job_tasks'".

   > **0021 must be applied on its own, before 0022 and 0023**, for the same
   > reason 0018 must precede 0019: it adds `notification_type` values that the
   > API writes immediately, and Postgres will not let a new enum value be used
   > in the transaction that added it. Run 0021, let it commit, then the other
   > two. `supabase db push` handles this itself.
   >
   > The API also reads `reviews` on every job query (the `has_review` flag) and
   > `platform_settings.commission_rate` on every escrow release, so **apply
   > 0022 and 0023 before deploying the API**. 0023's default commission rate is
   > 0, so applying it changes no payout until an admin sets a rate.

   The two Storage buckets are created by the migrations themselves
   (`insert into storage.buckets ... on conflict do nothing`), so there is no
   separate dashboard step. `job-photos` is public-read; `verification-docs`
   is private and is only ever read through short-lived signed URLs the API
   generates for admins.

3. (Development) In Authentication → Providers → Email, consider disabling
   "Confirm email" so `POST /auth/register` returns a session immediately.

### 2. API

```bash
cd backend
cp .env.example .env    # fill in your Supabase URL + keys (Settings → API)
npm install
npm run start:dev       # http://localhost:3000
```

`WEB_CORS_ORIGINS` is a comma-separated allowlist for credentialed browser
requests. Set it explicitly in every externally deployed API environment and
include the exact admin-console origin; do not use `*`, because browser-admin
sessions require `credentials: 'include'`.

```env
WEB_CORS_ORIGINS=https://your-admin.example.com,http://localhost:3000
```

### External deployment checklist

The repository contains the implementation, but an operator must still run
these external steps. This checklist does not assert that a deployment occurred.

1. Apply migrations through `0021_recovery_credit_kind.sql` in order. Run
   0018 and 0019 in separate SQL Editor transactions as described above; 0020
   comes after 0019 and creates the service-role-only admin list RPCs; 0021 is
   an independent enum addition and can run any time after that.
2. Set the API host's `WEB_CORS_ORIGINS`, then deploy the backend with the
   current environment variables and migrations available.
3. Set `NEXT_PUBLIC_API_URL` at the web host to that API's HTTPS origin and
   deploy the web application. Its origin must exactly match the CORS allowlist.
4. For mobile push, use a physical device to grant notification permission and
   register an Expo token after sign-in. Configure Expo/EAS credentials and,
   when Expo push security is enabled, set `EXPO_ACCESS_TOKEN` on the API host.
5. Run the smoke checks in
   [`docs/backend-handoff-booking-tasks-verification.md`](../docs/backend-handoff-booking-tasks-verification.md).

### 3. ML service

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate        # Windows (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

The committed model artifact (`ml-service/model/rf-a-v1.joblib`) is served as-is
— no training step needed. The API works without the service running, but
recommendation runs will fail until it's up (jobs still reach `recommending`;
use the manual trigger endpoint to retry). Full details:
[`../ml-service/README.md`](../ml-service/README.md).

## For frontend developers

### Base URL

| Environment | Base URL |
|---|---|
| **Production (Render)** | `https://taskbuddy-1d48.onrender.com` |
| Local development | `http://localhost:3000` |

Don't hardcode the URL — read it from an environment variable so it can be
switched per environment:

- **web (Next.js):** put `NEXT_PUBLIC_API_URL=https://taskbuddy-1d48.onrender.com`
  in `web/.env.local` and use `process.env.NEXT_PUBLIC_API_URL`.
- **mobile (Expo):** put `EXPO_PUBLIC_API_URL=https://taskbuddy-1d48.onrender.com`
  in `mobile/.env` and use `process.env.EXPO_PUBLIC_API_URL`.

> **Free-tier note:** the Render instance spins down after ~15 minutes without
> traffic; the first request after that takes 30–60 s to answer (cold start).
> If a request seems to hang, wait — it's waking up, not broken. Check
> <https://taskbuddy-1d48.onrender.com/health> if unsure.

### Authentication

1. `POST /auth/register` with `{ email, password, role, full_name }` — `role` is
   `"client"` or `"provider"` and **cannot change later**. A DB trigger creates the
   profile automatically.
2. `POST /auth/login` returns `{ session: { access_token, refresh_token, expires_at } }`.
3. Send `Authorization: Bearer <access_token>` on every other request.
4. When the token expires, `POST /auth/refresh` with `{ refresh_token }`.

Providers must additionally set up their provider profile
(`PUT /profiles/me/provider`) before they can apply to jobs.

### Endpoint reference

All bodies are JSON. 🔒 = requires auth; (client) / (provider) = role-restricted.

**Auth**

| Method & path | Description |
|---|---|
| `POST /auth/register` | `{ email, password, role, full_name, phone? }` |
| `POST /auth/login` | `{ email, password }` → `{ user: { id, email, full_name, role }, session }` |
| `POST /auth/admin/login` | admin-only browser login; sets httpOnly access/refresh cookies plus a readable CSRF cookie, returns minimal admin identity + `csrf_token` |
| `POST /auth/admin/refresh` | rotates browser-admin cookies; requires the refresh cookie and matching `X-CSRF-Token` |
| `GET /auth/admin/session` | current cookie-authenticated admin identity + `csrf_token` |
| `POST /auth/admin/logout` | revokes the current cookie-authenticated admin session and clears its cookies |
| `POST /auth/refresh` | `{ refresh_token }` → new session |
| `POST /auth/logout` 🔒 | revoke the session |
| `GET /auth/me` 🔒 | `{ profile, provider_profile }` |
| `POST /auth/change-password` 🔒 | `{ current_password, new_password }` — re-authenticates first |
| `POST /auth/forgot-password` | `{ email }` → mails a 6-digit code. **Always** `{ success: true }`, even for an unknown address — otherwise it's an email-enumeration oracle |
| `POST /auth/reset-password` | `{ email, token, new_password }` → `{ session }`. Needs the Supabase template to emit `{{ .Token }}` — see [`docs/password-reset-setup.md`](../docs/password-reset-setup.md) |
| `POST /auth/send-email-otp` | `{ email }` → mails the signup confirmation code. **Always** `{ success: true }` — same enumeration reasoning as forgot-password |
| `POST /auth/verify-email-otp` | `{ email, token }` → `{ user, session }`. Confirms the address with Supabase Auth and stamps `profiles.email_verified_at`. Needs the **Confirm signup** template to emit `{{ .Token }}` — see [`docs/email-otp-setup.md`](../docs/email-otp-setup.md) |

**Profiles & providers**

| Method & path | Description |
|---|---|
| `PATCH /profiles/me` 🔒 | update `full_name, phone, avatar_url, address, city, latitude, longitude`. `avatar_url` takes either an `avatars` Storage path (converted to a public URL) or an `https://` URL; `""` clears it |
| `PUT /profiles/me/provider` 🔒 (provider) | `{ category_id, bio (20–400 chars), years_experience?, service_radius_km? }` |
| `PATCH /profiles/me/provider/availability` 🔒 (provider) | `{ is_available: boolean }` |
| `DELETE /profiles/me` 🔒 | self-serve account deletion → `204`, or `409 { blockers[] }` while the account still has a balance, a pending withdrawal, escrow held, an open dispute, or a live job. A **soft** delete: the row survives (the ledger, reviews and ML snapshots reference it) with every identifying field scrubbed, and the Auth user is renamed, banned and signed out (migration 0022, `BACKEND_SCHEMA.md` §27.1) |
| `GET /providers/:id` 🔒 | public provider card (bio, category, rating, completed jobs) |
| `GET /providers/:id/reviews` 🔒 | reviews for a provider |
| `GET /categories` 🔒 | `[{ id, name }]` |

**Jobs**

| Method & path | Description |
|---|---|
| `POST /jobs` 🔒 (client) | `{ category_id, title (5–120), description (20–750), urgency?, address, latitude, longitude, budget?, scheduled_at?, photo_urls?, tasks? }` — `scheduled_at` in the past is a 400; `tasks` is up to 20 checklist labels (≤120 chars each) stored as `job_tasks` |
| `GET /jobs?category_id=&limit=&offset=&latitude=&longitude=&radius_km=` 🔒 (provider) | browse `open`/`recommending` jobs, sorted by urgency then distance/newest; `latitude`+`longitude` (both required together) filter to `radius_km` (default 50km) of the provider; returns `{ jobs, summary: { open_count, urgent_count, potential_payout } }` |
| `GET /jobs/mine` 🔒 (client) | own jobs |
| `GET /jobs/assigned` 🔒 (provider) | jobs assigned to me |
| `GET /jobs/:id` 🔒 | job detail |
| `POST /jobs/:id/cancel` 🔒 (client) | any pre-completion state → `cancelled` |
| `POST /jobs/:id/accept` 🔒 (provider) | accept an incoming booking request; `assigned` → `confirmed`, notifies the client (migration 0018) |
| `POST /jobs/:id/start` 🔒 (provider) | `assigned`/`confirmed` → `in_progress` |
| `POST /jobs/:id/decline` 🔒 (provider) | `{ reason (1–200) }` — assigned provider declines before starting; `assigned`/`confirmed` → `cancelled`, refunds escrow, notifies client |
| `PATCH /jobs/:id/tasks/:taskId` 🔒 (provider) | `{ is_done }` — assigned provider ticks a checklist item; allowed while `confirmed`/`in_progress`; returns the whole job (migration 0019) |
| `POST /jobs/:id/complete` 🔒 (client) | `in_progress` → `completed` |
| `POST /jobs/:id/recommendations/trigger` 🔒 (client) | manually re-run the recommendation engine |

**Applications**

| Method & path | Description |
|---|---|
| `POST /jobs/:jobId/applications` 🔒 (provider) | `{ cover_message? (≤300) }` — one per job |
| `GET /jobs/:jobId/applications` 🔒 (client) | applicants for own job |
| `GET /applications/mine` 🔒 (provider) | my applications with job info |
| `POST /applications/:id/accept` 🔒 (client) | hire this provider — assigns the job, auto-rejects everyone else, and holds the budget in escrow (400 if the wallet can't cover it) |
| `POST /applications/:id/reject` 🔒 (client) | decline |
| `POST /applications/:id/withdraw` 🔒 (provider) | retract a pending application |

**Reviews & notifications**

| Method & path | Description |
|---|---|
| `POST /jobs/:jobId/review` 🔒 (client) | `{ rating: 1–5, comment? (≤500) }` — once per completed job |
| `GET /notifications?unread=true` 🔒 | newest 50 |
| `GET /notifications/unread-count` 🔒 | `{ count }` — server-side count, not capped at 50 |
| `POST /notifications/:id/read` 🔒 | mark one read |
| `POST /notifications/read-all` 🔒 | mark all read |

**Wallet, Chat & Calendar** (🔒 — app-support subsystems, migration 0006)

| Method & path | Description |
|---|---|
| `GET /wallet` 🔒 | `{ balance, available, total_credited, total_debited, pending, pending_withdrawals, transactions[] }` — all derived from the ledger. `available` is `balance` less anything already promised to a pending withdrawal; that is the figure escrow checks before a hire |
| `POST /wallet/withdrawals` 🔒 | `{ amount, destination, title? }` → a **pending** ledger row. Nothing moves until an admin settles it — there is no payout rail, so the admin queue *is* the disbursement mechanism (migration 0023, `BACKEND_SCHEMA.md` §27.2) |
| `GET /wallet/withdrawals` 🔒 | the caller's own requests, newest first |
| `POST /wallet/withdrawals/:id/cancel` 🔒 | retract a request an admin has not acted on |
| `POST /wallet/transactions` 🔒 | **Deprecated** — use `POST /wallet/withdrawals`. Still accepts `{ direction: 'debit', amount, title, job_id?, destination? }` and now files the same pending request. `direction: 'credit'` is refused: wallet funding has exactly one entry point, a settled Stripe charge |
| `GET /conversations` 🔒 | caller's conversations (counterpart name + last-message time) |
| `POST /conversations` 🔒 | get-or-create for `{ job_id }` — job must have an assigned provider |
| `GET /conversations/:id/messages` 🔒 | messages, oldest first |
| `POST /conversations/:id/messages` 🔒 | send `{ body (1–1000) }` |
| `POST /conversations/:id/read` 🔒 | mark the other participant's messages read |
| `GET /conversations/:id/stream?since=` 🔒 | **SSE.** `message` events carrying a full message row, plus `ping` keep-alives. `since` = `created_at` of the newest message the client already has. Needs a client that sends an `Authorization` header — browser `EventSource` cannot |
| `GET /calendar/bookings?from=&to=` 🔒 | caller's bookings (provider or client side), with job + counterpart |
| `POST /calendar/bookings` 🔒 (provider) | `{ job_id, scheduled_at, duration_minutes?, notes? }` — schedule an assigned job |
| `PATCH /calendar/bookings/:id` 🔒 (provider) | `{ scheduled_at?, duration_minutes?, status?, notes? }` |

**Uploads** (🔒 — migration 0007/0008)

| Method & path | Description |
|---|---|
| `POST /uploads/signed-url` 🔒 | `{ bucket: 'job-photos' \| 'verification-docs' \| 'avatars', content_type }` → `{ bucket, path, upload_url, token }` |

The object path is generated **server-side** as `<profile id>/<uuid>.<ext>` — a
client-supplied path would let one user overwrite another's ID documents. Upload
the file straight to `upload_url` with a `PUT`, then send the returned `path`
(not a URL) to `POST /jobs` or `POST /verifications`. Only `image/jpeg`,
`image/png` and `image/webp` are accepted, and `verification-docs` is
provider-only. Bytes never pass through the API — the Render free tier would
have to buffer every image.

**Verifications** (migration 0008)

| Method & path | Description |
|---|---|
| `POST /verifications` 🔒 (provider) | `{ id_document_path, selfie_path }` — 400 if one is already pending, or if either upload fails the pre-check (missing/zero-byte/non-image object; migration 0014) |
| `POST /verifications/identity-session` 🔒 (provider) | starts a **Stripe Identity** session instead → `{ verification, session_id, ephemeral_key_secret, url, publishable_key }`. Documents go to Stripe and never reach this server; the result arrives by webhook, so poll `GET /verifications/me` |
| `GET /verifications/me` 🔒 (provider) | latest submission + status |

Two routes, one queue: a `manual` row carries document paths and waits for an
admin, a `stripe_identity` row carries none and is resolved by webhook. Only one
review may be open per provider, whichever route it came in by.

Approval flips `provider_profiles.is_verified`. That flag is a **badge only** —
applying to jobs is deliberately *not* gated on it, since gating would lock out
every provider who signed up before verification existed.

**Disputes** (migration 0009)

| Method & path | Description |
|---|---|
| `POST /jobs/:jobId/disputes` 🔒 (client) | `{ reason (1–200), details? (≤1000) }` — the job's escrow must still be `held` |
| `GET /jobs/:jobId/disputes` 🔒 | the job's latest dispute (client or assigned provider) |

**Settings** (🔒 — migration 0011)

| Method & path | Description |
|---|---|
| `GET /settings` 🔒 | `{ push_enabled, email_enabled, sms_enabled, location_sharing, dark_mode }` — creates the row with DDL defaults on first read |
| `PATCH /settings` 🔒 | any subset of those five booleans; upserts, so a toggle works before any read |

Only `push_enabled` is enforced today. The email and SMS flags are stored so the
screen round-trips honestly; no transport reads them yet.

**Push notifications** (🔒 — migration 0012)

| Method & path | Description |
|---|---|
| `POST /devices` 🔒 | `{ token: 'ExponentPushToken[...]', platform: ios/android/web }` — upserts on `token`, so a handset that changes hands follows its new owner |
| `DELETE /devices/:token` 🔒 | unregister on sign-out. Scoped to the caller's own rows |

Delivery is a 30-second `@Cron` sweep of `notifications` where `pushed_at is
null`, filtered by each recipient's `push_enabled`. Best-effort: `notifications`
stays the source of truth, and a push that never lands costs a banner, not a
record. Tokens Expo rejects as `DeviceNotRegistered` are deleted.

**Payments** (migration 0013 — [`docs/stripe-setup.md`](../docs/stripe-setup.md))

| Method & path | Description |
|---|---|
| `POST /payments/config` 🔒 | `{ publishable_key }` — served rather than compiled in, so test↔live is a backend env change |
| `POST /payments/topup` 🔒 | `{ amount }` (₱20–₱100,000) → PaymentSheet parameters: `{ payment_intent_client_secret, ephemeral_key_secret, customer_id, publishable_key, amount, currency }` |
| `POST /payments/checkout-session` 🔒 | `{ amount, app_redirect }` → `{ url, session_id, amount }`. Hosted Checkout, for clients that cannot load a native SDK — **this is what the Expo Go app uses** |
| `GET /payments/return?status=&app_redirect=` | Where Stripe returns the browser. Redirects to the app deep link with `?topup=success\|cancelled`. No JWT — it is a plain browser navigation that reveals and changes nothing |
| `POST /payments/webhook` | Stripe only. No JWT — authenticated by the signature over the **raw** body |

**The wallet is credited by the webhook, never by `POST /payments/topup`, and
never by the browser returning from Checkout.** Those only open the payment UI;
a client that reported its own success could mint balance, and balance buys
labour through escrow. Refresh `GET /wallet` afterwards — on a slow webhook the
balance can lag a second or two.

Both routes converge on one handler: the Checkout session puts the payer
identity in `payment_intent_data.metadata`, so `payment_intent.succeeded`
credits the wallet whether the charge came from PaymentSheet or Checkout. No
second handler, and no extra Dashboard subscription.

`app_redirect` is checked against the same allowlist as the Google OAuth flow
(`isAllowedAppRedirect`) at both session creation and return. Stripe accepts
only http(s) in `success_url`, which is the whole reason `/payments/return`
exists — and without that check it would be an open redirect.

`GET /payments/return` builds its URLs from `PUBLIC_API_URL`, falling back to
the request's host and `x-forwarded-proto`. On Render TLS terminates at the
proxy, so the raw protocol would be `http` and users would be bounced out of
TLS mid-payment.

Redelivery is safe: `wallet_transactions.stripe_payment_intent_id` is
partial-unique and the collision *is* the idempotency check. Without Stripe env
vars these endpoints return **503** and the rest of the API is unaffected.

**Admin** (🔒 admin role only — 401 without a token, 403 for non-admins)

| Method & path | Description |
|---|---|
| `GET /admin/users?search=&role=&status=&limit=&offset=` | search/filter users (`role`: client/provider/admin, `status`: active/suspended/**deleted**). Deleted accounts are excluded unless asked for, and never appear under `suspended` (migration 0022) |
| `GET /admin/users/:id` | single user detail (from `admin_user_overview`) |
| `POST /admin/users/:id/suspend` | `{ duration_days?, reason }` — refuses if already suspended or if the target is an admin. Omit `duration_days` for indefinite; otherwise the suspension lifts itself the next time `deactivated_at` is checked (login), no cron job |
| `POST /admin/users/:id/reinstate` | reactivate a suspended account |
| `POST /admin/users/:id/send-password-reset` | admin-triggered password reset email — refuses admin targets (migration 0014) |
| `GET /admin/bookings?search=&status=&category_id=&limit=&offset=` | platform-wide bookings view; search matches booking ID, client/provider name, or service category (story #31) |
| `GET /admin/bookings/:id` | one booking's full detail, plus its escrow record if one exists; stored `job-photos` paths are returned as public photo URLs |
| `POST /admin/bookings/:id/cancel` | force-cancel a booking — refuses if already `completed`/`cancelled`/`expired` |
| `GET /admin/analytics/summary` | totals (users/clients/providers/suspended/bookings/avg_rating/revenue/**commission**/`pending_verifications`/`pending_withdrawals`), bookings by status/category, daily booking trend, revenue trend, commission trend, top 10 providers by completed jobs (story #32). `total_revenue` is what flowed *through* the platform; `total_commission` is what it *kept* — see `BACKEND_SCHEMA.md` §27.5 |
| `GET /admin/activity?search=&limit=&offset=&from=&to=` | job-status transitions; search matches job title → `{ items, total }` (migration 0014 — was a bare array of the newest 20) |
| `GET /admin/audit?action=&actor_id=&from=&to=&limit=&offset=` | the admin action audit trail → `{ actions, total }` (migration 0014) — see below |
| `GET /admin/jobs/:jobId/conversation` | read-only view of a job's chat, oldest first, for dispute review (migration 0014) |
| `GET /admin/verifications?status=&limit=&offset=` | review queue; rows carry provider name, email, and short-lived signed document URLs |
| `POST /admin/verifications/:id/approve` | approve → sets `provider_profiles.is_verified` |
| `POST /admin/verifications/:id/reject` | `{ reason? }` |
| `GET /admin/transactions?search=&status=&limit=&offset=` | escrow records with both parties + service name; search matches transaction ID, client/provider name, or job title (story #17/#18) |
| `GET /admin/disputes?status=&limit=&offset=` | dispute queue |
| `POST /admin/disputes/:id/resolve` | `{ resolution: 'released_to_provider' \| 'refunded_to_client', note? }` (story #20) |
| `GET /admin/withdrawals?status=&limit=&offset=` | the settlement queue — `pending` by default, oldest first (migration 0023) |
| `POST /admin/withdrawals/:id/settle` | `{ reference? }` — records that the money was actually sent. This is what debits the wallet; the balance is re-checked first and the row is only settled once, whoever clicks |
| `POST /admin/withdrawals/:id/reject` | `{ reason }` — the reason reaches the account holder and the amount returns to their available balance |
| `GET /admin/categories` | every service category, active or not (`GET /categories` still serves the apps only active ones) |
| `POST /admin/categories` | `{ name }` — 409 on a duplicate name |
| `PATCH /admin/categories/:id` | `{ name?, is_active? }`. **No delete** — jobs, provider profiles and the ML feature set all reference a category by id; `is_active: false` takes it off the menu without rewriting history |
| `GET /admin/admins` | who currently holds admin |
| `POST /admin/admins` | `{ email, full_name }` — creates or promotes an admin. **No password is accepted**; the new admin sets their own from the reset email this sends |
| `POST /admin/admins/:id/revoke` | demote to `client`. Refuses self-demotion and refuses to remove the last admin |
| `POST /admin/notifications/broadcast` | `{ title, body, audience: 'all' \| 'clients' \| 'providers' }` → `{ sent, failed, audience }`. One row per recipient (so read state and push both work); excludes admins, suspended and deleted accounts |
| `GET /admin/commission` | the current platform cut |
| `PATCH /admin/commission` | `{ commission_rate }` — a **fraction**, 0.15 being 15%, capped at 0.5. Applies to escrow released from now on; settled jobs keep their figures (migration 0023) |

Admin accounts can't self-register (`POST /auth/register` only allows
`client`/`provider`). The admin console uses `POST /auth/admin/login` and the
cookie-session endpoints above; mobile and other bearer-token clients can use
the general login flow. See `0005_admin_role.sql` above for how to promote an
account to `admin`.

**Admin audit trail** (migration 0014, `admin_actions` table, service-role only
— never client-readable outside `GET /admin/audit`): every `suspend`,
`reinstate`, `bookings/:id/cancel`, verification `approve`/`reject`, and
dispute `resolve` writes a row (`actor_id`, `action` like `user.suspend`,
`target_type`, `target_id`, `metadata`). Distinct from `job_status_history`,
which audits job lifecycle transitions, not the admin behind a decision.

### Escrow, in one paragraph

There is **no payment gateway** — the `wallet_transactions` ledger is the only
account of record. When a client accepts an application on a job with a
`budget`, the client is **debited** and an `escrow_transactions` row is created
as `held`. On completion it becomes `released` and the provider is **credited**.
Cancelling returns the money to the client; a dispute freezes it until an admin
resolves it either way (release → provider, refund → client).

Because a hold needs real funds, **`POST /applications/:id/accept` returns 400
`Insufficient wallet balance`** when the client can't cover the budget — the job
stays `open`. Clients top up through Stripe hosted Checkout
(`POST /payments/checkout-session`), and the wallet is credited when Stripe's
webhook reports the charge settled. That webhook is the **only** way money
enters: `POST /wallet/transactions` refuses `direction: 'credit'`, since anything
else would let any authenticated caller mint balance that buys real labour.

The balance the hold checks is the **available** one — settled, less anything
already promised to a pending withdrawal. Without that reservation a client could
file a withdrawal for their whole balance and hire someone with the same money;
whichever settled second would take the ledger negative.

Money leaves by request, not by ledger entry. `POST /wallet/withdrawals` files a
**pending** row and an admin settles it by hand from `GET /admin/withdrawals` —
there is no payout rail, so that queue *is* the disbursement mechanism
(`BACKEND_SCHEMA.md` §27.2).

Every ledger row carries a `kind`, and **`kind = 'payout'` is the gross value
that flowed through the platform**. This matters: a payout and a refund are both
credits with a `job_id`, so the old `direction + job_id` rule would have counted
refunds as revenue. `kind` is derived server-side and never read from the request
body — otherwise anyone could inflate the reported figure by topping up.

What the platform actually **keeps** is the commission: a fraction of the budget
withheld at release, frozen onto `escrow_transactions.commission_amount`. It has
no ledger row of its own, because `wallet_transactions` is keyed by profile and
the platform is not a profile. The rate defaults to 0, so nothing is withheld
until an admin sets one via `PATCH /admin/commission`. See `BACKEND_SCHEMA.md`
§18 — including the documented concurrency caveat on the balance check — and
§27.5.

### Errors

Errors use NestJS's standard shape with proper status codes (400 validation,
401 bad/expired token, 403 wrong role/not owner, 404 not found):

```json
{ "statusCode": 400, "message": ["title must be longer than or equal to 5 characters"], "error": "Bad Request" }
```

### Example flow (curl)

```bash
API=https://taskbuddy-1d48.onrender.com   # or http://localhost:3000

# 1. Register + login as client
curl -X POST $API/auth/register -H "Content-Type: application/json" \
  -d '{"email":"client@test.com","password":"secret123","role":"client","full_name":"Ana Cruz"}'
TOKEN=$(curl -sX POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"client@test.com","password":"secret123"}' | jq -r .session.access_token)

# 2. Post a job
curl -X POST $API/jobs -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"category_id":1,"title":"Fix kitchen faucet","description":"Tumutulo yung gripo sa kusina, need ayusin agad po.","urgency":"urgent","address":"Quezon City","latitude":14.6760,"longitude":121.0437}'
```

## Recommendation engine

- A scheduler inside the API runs **every minute**: `open` jobs past their
  `recommendation_deadline` flip to `recommending` (at most once), get scored, and
  the top 8 providers receive `recommendation_invite` notifications.
- Feature vectors come from the `fn_job_provider_features(job_id)` SQL function —
  14 raw features per pair, names matching the ML training CSV exactly.
- Scoring is done by the trained **Random Forest `rf-a-v1`** in ml-service
  (`recommendation_runs.model_version` records which model produced each run).
- Every scored pair is snapshotted in `recommendation_candidates`; when the job
  closes, `was_hired` is backfilled, turning production data into retraining rows.
  Export query: see `BACKEND_SCHEMA.md` §13 — **exclude `model_version = 'stub-v0'`
  rows** (produced by the early placeholder scorer). Retraining/versioning guide:
  [`../ml-service/README.md`](../ml-service/README.md).

## Project layout

```
backend/
├── BACKEND_SCHEMA.md            # authoritative data & ML spec
├── supabase/migrations/         # SQL: schema, triggers, RLS, seed
└── src/
    ├── supabase/                # service-role + anon Supabase clients
    ├── auth/                    # register/login/refresh, JWT guard, @Roles
    ├── profiles/                # own profile + provider profile
    ├── categories/  providers/  # lookups & public provider cards
    ├── jobs/                    # posting, browsing, lifecycle transitions
    ├── applications/            # apply / accept / reject / withdraw
    ├── reviews/  notifications/
    ├── recommendations/         # scoring service + every-minute scheduler
    ├── wallet/  chat/  calendar/  # app-support subsystems (migration 0006)
    ├── uploads/                 # signed Storage upload URLs (0007/0008)
    ├── verifications/           # provider ID/selfie submissions (0008)
    ├── escrow/                  # escrow lifecycle + disputes (0009)
    └── admin/                   # admin console: users, bookings, analytics,
                                 # verification queue, transactions, disputes
```

## Scripts

```bash
npm run start:dev   # dev server with watch
npm run build       # compile
npm run lint        # eslint --fix
npm run format      # prettier
```
