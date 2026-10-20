# TaskBuddy Backend

REST API for **TaskBuddy**, a Philippine home-services marketplace: **clients**
post jobs in five categories (Plumbing, Cleaning, Handyman, Manicure, Pedicure)
and **providers** apply to them. If nobody is hired before the job's urgency
timeout, an ML **recommendation engine** scores eligible providers and invites
the best matches.

The full data-schema and product spec lives in [`BACKEND_SCHEMA.md`](./BACKEND_SCHEMA.md)
— that document is the source of truth for tables, lifecycle rules, and ML features.

> **🚀 Deployed instance:** the backend is live at
> **https://taskbuddy-kpek.onrender.com** — frontend developers can build
> against it directly, no local backend setup required (see
> [Base URL](#base-url) below). Status page: <https://taskbuddy-kpek.onrender.com/> ·
> JSON health: <https://taskbuddy-kpek.onrender.com/health>

> **Release check (2026-10-18):** historical checkpoint — migrations through
> **0074** were verified against the linked Supabase project. The proposal
> quote handoff says 0075 was applied manually; this task did not inspect the
> live database. Migrations **0076** and **0077** below are new and have not
> been applied or verified live. See the current
> [backend implementation plan](../docs/backend-handoff-plan-2026-10-20.md).

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
  <https://taskbuddy-ml-service-8ppc.onrender.com> — see
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
   (0001 → 0069; 0068 is reserved for the certificate PR), either by pasting each file into the SQL Editor or with the CLI:

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
   | `0021_recovery_credit_kind.sql` | adds `'recovery_credit'` to `wallet_txn_kind`, the tag an admin-issued trust credit carries (`POST /admin/wallet-transactions/recovery-credit`, `BACKEND_SCHEMA.md` §28.1). Safely re-runnable. |
   | `0022_notification_announcement_type.sql` | `notification_type` gains `'announcement'` (admin broadcast) and `'wallet_update'` (withdrawal settled/declined). |
   | `0023_account_deletion_and_email_otp.sql` | `profiles.deleted_at` (soft delete) and `profiles.email_verified_at`; `admin_user_overview` re-created to expose `deleted_at`. |
   | `0024_withdrawal_requests_and_commission.sql` | withdrawal review columns on `wallet_transactions`, `platform_settings.commission_rate` (default 0), `escrow_transactions.commission_amount`. |
   | `0025_scheduler_cron.sql` | Postgres-driven scheduler ticks (pg_cron + pg_net) calling `POST /internal/tick/*`, so push and recommendation sweeps run while the API host sleeps. Read its header before applying — it needs a setup snippet run first. |
   | `0026_rls_write_lockdown.sql` | drops every RLS **write** policy 0003/0006/0019 granted to signed-in users (own profile, own provider row — including `is_verified` — jobs, application status, reviews, messages, checklist, notification read-state). All writes go through the API; reads are unchanged. See `BACKEND_SCHEMA.md` §11 and §17. Re-runnable. |
   | `0027_connect_transfer_kind.sql` | adds `'connect_transfer'` to `wallet_txn_kind`. **Apply alone and let it commit before 0028**, which names the value in an index. |
   | `0028_stripe_connect_and_card_funding.sql` | `provider_payout_accounts` (Connect Express, service-role writes only); escrow funding (`wallet`/`card`) and onward-transfer columns; `wallet_transactions.stripe_transfer_id`; and the service-role-only SQL functions `escrow_place_hold`, `escrow_settle`, `wallet_reserve_connect_transfer` that change escrow and write its ledger row in **one** transaction. See `BACKEND_SCHEMA.md` §29. Re-runnable. |
   | `0029_payments_tick_cron.sql` | schedules the payments sweep (`/internal/tick/payments`, every 5 min) through 0025's `scheduler_tick`. Does nothing, with a notice, where pg_cron or 0025 is absent. Re-runnable. |
   | `0030_chat_attachments.sql` | `messages.attachment_path`; creates the private `chat-attachments` Storage bucket. See `BACKEND_SCHEMA.md` §30. |
   | `0031_messages_body_or_attachment.sql` | replaces 0006's `messages` body CHECK — 0030 added `attachment_path` but never relaxed it, so an attachment-only send (the only kind the app's attach flow produces) was rejected by Postgres. Now requires body OR attachment, never neither. Re-runnable. |
   | `0032_matching_eligibility.sql` | replaces `fn_job_provider_features`' WHERE clause: providers must be verified, have a bio, and be within their own `service_radius_km` (same category or not). Without it, one signup-created provider with a NULL bio makes ml-service reject the whole scoring batch. Same signature and features. Also adds `jobs.recommendation_attempted_at` and the service-role-only `claim_unscored_recommending_jobs` the scheduler's retry uses. **Apply before deploying the API** — the scheduler writes that column. Re-runnable. See `BACKEND_SCHEMA.md` §32. |

   Migrations added after 0032:

   | File | Contents |
   |---|---|
   | `0033_oauth_handoffs.sql` | Single-use OAuth handoff codes. |
   | `0034_qa_provider_admin.sql` | Verification document types, provider acceptance location, secondary categories/service requests and admin verification fields. |
   | `0035_backfill_active_bookings.sql` | Repeatable historical booking backfill for confirmed/in-progress jobs without a calendar row. |
   | `0036_admin_handover_queries.sql` | Service-role-only audit/wallet search and exact dashboard/booking counts. **Apply before deploying the updated API.** |
   | `0037_fulltest_remediation.sql` | Approved-skill eligibility, job-task and dispute safeguards, chat notifications, and escrow protection. Applied to the linked project on 2026-10-02; its earlier remote history mismatch has since been reconciled. |
   | `0038_admin_queue_search.sql` | Service-request search with matching pagination totals, booking-title search/counts, and a service-role-only password-presence check for Google-only mobile accounts. Applied to the linked project; apply before deploying this API to another project. |
   | `0039`–`0045` | Dispute, warranty, portfolio, and wallet safeguards; see the migration files for order and effects. The warranty hold was later replaced by 0060 and the wallet retired by 0056. |
   | `0046_early_payment_release.sql` | Atomic client-authorized release of a completed job's held payment. *Disabled by 0064.* |
   | `0047_shared_platform_identity.sql` | Shared platform name/support email with versioned admin updates and audit. |
   | `0048_job_capacity.sql` | Server-enforced active-job, pending-application and booking limits. |
   | `0049_job_change_requests.sql` | Participant-approved schedule and wallet-funded price changes. |
   | `0050_provider_release_requests.sql` | Rate-limited provider requests for early payment release. *Disabled by 0064.* |
   | `0051_admin_alert_notification_type.sql` | Adds the notification type for persistent admin inbox alerts. Apply before 0052. |
   | `0052_web_admin_handoffs.sql` | Structured case recipients/evidence requests, admin inbox events, notification broadcast delivery counters, and dismissal state. |
   | `0053_price_tiers.sql` | Category base prices, urgency price multipliers, per-task effort and the job's chosen price tier. **Apply before deploying the updated API.** |
   | `0054_provider_credentials.sql` | Provider skill credentials and the private `provider-credentials` bucket. |
   | `0055_terms_versions.sql` | Which Terms & Conditions version each account accepted. |
   | `0056_retire_wallet.sql` | Retires the in-app wallet: linked GCash/Maya/bank payout accounts, `pass_through_balances()` (simulated payouts and refunds, so no balance is ever kept), and a cut-over that removes existing balances. **Apply before deploying the updated API.** |
   | `0057_price_change_payments.sql` | Price change requests without a wallet: decreases refunded, increases wait for the client to pay the difference (`awaiting_payment`, 24 h). |
   | `0058_xendit_payouts.sql` | Xendit replaces PayMongo: payout accounts carry a Xendit channel code, and provider payouts can be queued for Xendit's sandbox Payouts API. **Apply before deploying the updated API.** |
   | `0059_photo_evidence.sql` | Photo evidence: up to 6 photos on complaints and each statement/appeal (private `dispute-evidence` bucket), and 1–4 proof photos required to tick a checklist task done (`task-proof` bucket). |
   | `0060_release_on_completion.sql` | No holding period: a job's payment is released as soon as the client confirms completion (an open complaint still blocks release). Replaces the 72-hour warranty from 0040. |
   | `0061_chat_alerts.sql` | Chat stops writing to `notifications`. Adds unread counts per conversation (`chat_unread_counts`) and a per-conversation push throttle (`claim_chat_push`). |
   | `0062_service_radius_bounds.sql` | Clamps `provider_profiles.service_radius_km` into 1–50 km and adds a CHECK for it (the API validates the same bounds). |
   | `0063_job_dispute_state.sql` | `jobs.dispute_state` (`open` / `resolved`), kept in sync with `disputes` by a trigger. The API derives `display_status` (`disputed` while a dispute is open) from it. |
   | `0064_disable_early_release.sql` | Disables the early-release RPCs from 0046 and 0050 (they raise `TB409`); rows are kept. **Apply before deploying the API.** |
   | `0065_admin_bookings_disputed_filter.sql` | `admin_list_bookings` accepts the `disputed` status filter. |
   | `0066_complaints_before_completion.sql` | Complaints can only be raised before the client confirms the job is done (payment is released at that point). |
   | `0067_lock_commission_rate.sql` | `escrow_transactions.commission_rate` is stored at hire and used at release; the database computes the fee from it. Held escrows are backfilled with the current rate. |
   | `0068_credentials_required.sql` | Certificates required for verification: `provider_profiles.identity_verified` holds the identity half and `is_verified` is recomputed from it plus an approved, unexpired certificate for the main service; `provider_approved_categories` requires a certificate per service (Manila date); one-transaction decisions (`decide_identity_verification`, `decide_credential`, `admin_decide_verification_case`); expiry reminders on the payments tick (`credential_expiry_tick`). **Running it unverifies providers without a certificate.** Apply, then deploy the API right after. |
   | `0069_defer_job_dispute_sync.sql` | Fixes 0063: the dispute-state sync becomes a deferred constraint trigger, so client cancellations of hired jobs no longer abort. |
   | `0070_signup_role_whitelist.sql` | `handle_new_user` accepts only `client` or `provider` from sign-up metadata; anything else becomes `client`. Admins are created only by `POST /admin/admins` (audit C3). |
   | `0071_oauth_handoff_binding.sql` | `oauth_handoffs.challenge` and `secret_hash`: a Google sign-in claim needs the app's verifier and the redirect's secret (audit C2). |
   | `0072_lockdown_direct_reads_and_uploads.sql` | Direct PostgREST reads: a user reads only their own profile; open jobs only by providers; `stripe_events` closed to anon/authenticated. `avatars`, `chat-attachments`, `job-photos` and `verification-docs` limited to 10 MB JPEG/PNG/WebP (audit H7, H8, M5). |
   | `0073_money_holds_and_sweeps.sql` | A cancelled hold can be re-held for another provider at the current price; `pass_through_balances` leaves client payments younger than 15 minutes for their hold; price-difference holds take the wallet lock and check the balance (audit H3, H5, H6). |
   | `0074_admin_users_certificate_status.sql` | `admin_user_certificates` view (service role only): `identity_verified` and the main-service `certificate_status` (approved, pending, expired, rejected), attached to `GET /admin/users` rows. |
   | `0075_proposal_quotes.sql` | Stores provider proposal quotes and places the escrow hold atomically at the accepted quote. |
   | `0076_job_address_details.sql` | Optional house, unit, floor, or landmark details, separate from the signed job pin. |
   | `0077_xendit_hire_invoice_recovery.sql` | Persists Xendit hire invoices and uses a five-minute claim lease so webhooks, manual status checks, and the reconciliation tick can recover delayed payments safely. |

   On the linked project, 0001–0052 are recorded in the migration history.
   Later migrations were applied but not all are recorded there (0060 and
   0062 are recorded under timestamps). Verify by checking the database
   objects each file creates.

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
   > requirement — it's a standalone enum addition.
   >
   > The API code that ships with these migrations reads `job_tasks` on every
   > job query, so **apply 0019 before deploying the API**. Out of order, job
   > endpoints fail with PostgREST's "Could not find a relationship between
   > 'jobs' and 'job_tasks'".

   > **0022 must be applied on its own, before 0023 and 0024**, for the same
   > reason 0018 must precede 0019: it adds `notification_type` values that the
   > API writes immediately, and Postgres will not let a new enum value be used
   > in the transaction that added it. Run 0022, let it commit, then the other
   > two. `supabase db push` handles this itself.
   >
   > The API also reads `reviews` on every job query (the `has_review` flag) and
   > `platform_settings.commission_rate` on every escrow release, so **apply
   > 0023 and 0024 before deploying the API**. 0024's default commission rate is
   > 0, so applying it changes no payout until an admin sets a rate.

   The Storage buckets are created by the migrations themselves
   (`insert into storage.buckets ... on conflict do nothing`), so there is no
   separate dashboard step. `job-photos`, `avatars`, `provider-portfolio` and
   `task-proof` are public-read. `verification-docs`, `chat-attachments`,
   `provider-credentials` and `dispute-evidence` are private and are only ever
   read through short-lived signed URLs the API generates.

3. (Development) In Authentication → Providers → Email, consider disabling
   "Confirm email" so `POST /auth/register` returns a session immediately.

### 2. API

```bash
cd backend
cp .env.example .env    # fill in your Supabase URL + keys (Settings → API)
npm install
npm run start:dev       # http://localhost:3000
```

Every variable is listed in [`.env.example`](./.env.example):

| Group | Variables | Needed for |
|---|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | everything |
| Server | `PORT`, `WEB_CORS_ORIGINS`, `TRUST_PROXY_HOPS`, `PUBLIC_API_URL` | deployment, payment return URLs |
| ML | `ML_SERVICE_URL` | recommendations |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_STATE_SECRET` | Google sign-in |
| Geocoding | `GEOAPIFY_API_KEY` | address verification, autocomplete, static maps |
| Xendit | `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN` | pay at hire and payouts (preferred when set) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MOBILE_API_VERSION`, `STRIPE_CONNECT_*` | card checkout fallback, Identity, Connect |
| Push | `EXPO_ACCESS_TOKEN` | Expo push delivery |
| Scheduling | `CRON_DRIVER`, `CRON_SECRET` | unset runs the in-process `@Cron` sweeps; `pg_cron` lets Postgres (migration 0025) call `POST /internal/tick/{push,recommendations,payments}` with the secret instead |

`RENDER_GIT_COMMIT` is set by Render and reported by `/health`.

`WEB_CORS_ORIGINS` is a comma-separated allowlist for credentialed browser
requests. Set it explicitly in every externally deployed API environment and
include the exact admin-console origin; do not use `*`, because browser-admin
sessions require `credentials: 'include'`.

```env
WEB_CORS_ORIGINS=https://your-admin.example.com,http://localhost:3000
```

`TRUST_PROXY_HOPS` says how many proxies sit in front of the API; it defaults
to `1`, which is right on Render. It exists for the rate limiter: without it
every request behind the proxy arrives from the same address, the limiter sees
the whole platform as one client, and one abusive caller locks everybody out.
Set it to `0` only when the API is exposed directly — the value is also what
stops a client's own `X-Forwarded-For` from being a way around the limit.

### External deployment checklist

The repository contains the implementation. For a new environment, complete
these external steps. The linked-project and Render observations above do not
verify a different environment or a frontend/device release.

1. Apply every migration in order, through the latest. Run 0018 and 0019 in
   separate SQL Editor transactions as described above, and 0022 on its own
   before 0023/0024; 0020 comes after 0019 and creates the service-role-only
   admin list RPCs. 0026 can run any time after 0025 — the API writes with the
   service-role key and is unaffected by it.
2. Set the API host's `WEB_CORS_ORIGINS`, then deploy the backend with the
   current environment variables and migrations available.
3. Set `NEXT_PUBLIC_API_URL` at the web host to that API's HTTPS origin and
   deploy the web application. Its origin must exactly match the CORS allowlist.
4. For mobile push, use a physical device to grant notification permission and
   register an Expo token after sign-in. Configure Expo/EAS credentials and,
   when Expo push security is enabled, set `EXPO_ACCESS_TOKEN` on the API host.
5. Run the smoke checks in [`HANDOFF.md`](../HANDOFF.md) and the relevant
   backend handoff guides in [`docs/`](../docs/).

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
| **Production (Render)** | `https://taskbuddy-kpek.onrender.com` |
| Local development | `http://localhost:3000` |

Don't hardcode the URL — read it from an environment variable so it can be
switched per environment:

- **web (Next.js):** put `NEXT_PUBLIC_API_URL=https://taskbuddy-kpek.onrender.com`
  in `web/.env.local` and use `process.env.NEXT_PUBLIC_API_URL`.
- **mobile (Expo):** put `EXPO_PUBLIC_API_URL=https://taskbuddy-kpek.onrender.com`
  in `mobile/.env` and use `process.env.EXPO_PUBLIC_API_URL`.

> **Free-tier note:** the Render instance spins down after ~15 minutes without
> traffic; the first request after that takes 30–60 s to answer (cold start).
> If a request seems to hang, wait — it's waking up, not broken. Check
> <https://taskbuddy-kpek.onrender.com/health> if unsure.

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
| `GET /auth/me` 🔒 | `{ profile, provider_profile, has_password }`; Google-only accounts without a password report `false` so mobile hides Change Password (migration 0038) |
| `POST /auth/change-password` 🔒 | `{ current_password, new_password }` — re-authenticates first |
| `POST /auth/forgot-password` | `{ email }` → mails a 6-digit code. **Always** `{ success: true }`, even for an unknown address — otherwise it's an email-enumeration oracle |
| `POST /auth/reset-password` | `{ email, token, new_password }` → `{ session }`. Needs the Supabase template to emit `{{ .Token }}`; the linked project's Email OTP expiry is 3600 seconds. Rejected-code logs include Supabase status/code/message without recording the token or new password — see [`docs/password-reset-setup.md`](../docs/password-reset-setup.md) |
| `POST /auth/send-email-otp` | `{ email }` → mails the signup confirmation code. **Always** `{ success: true }` — same enumeration reasoning as forgot-password |
| `GET /auth/google/authorize?app_redirect=&handoff=&handoff_challenge=` · `GET /auth/google/callback` | server-side Google OAuth. With a `handoff`, `handoff_challenge` (hex sha256 of a verifier the app keeps) is required; the callback parks the session and redirects with `handoff` and a one-time `handoff_secret` (0071) |
| `POST /auth/google/claim` | `{ handoff_id, handoff_secret, verifier }` → `{ session }`; all three must match, single use, 5 minutes (see `docs/google-auth-setup.md`) |
| `POST /auth/complete-google-profile` 🔒 | role and details for a new Google account |
| `POST /auth/accept-terms` 🔒 | `{ version }`: records the Terms version accepted (migration 0055) |
| `POST /auth/verify-email-otp` | `{ email, token }` → `{ user, session }`. Confirms the address with Supabase Auth and stamps `profiles.email_verified_at`. Needs the **Confirm signup** template to emit `{{ .Token }}` — see [`docs/email-otp-setup.md`](../docs/email-otp-setup.md) |

**Profiles & providers**

| Method & path | Description |
|---|---|
| `PATCH /profiles/me` 🔒 | update `full_name, phone, avatar_url, address, city`. A changed `address`/`city` is geocoded server-side and stores `latitude`/`longitude`; if it can't be verified the save is rejected (`400`, or `503` when geocoding is unavailable). An unchanged address still missing coordinates is geocoded best-effort and never blocks the save. Coordinates are never accepted from the client (`BACKEND_SCHEMA.md` §32). `avatar_url` takes either an `avatars` Storage path (converted to a public URL) or an `https://` URL; `""` clears it |
| `PUT /profiles/me/provider` 🔒 (provider) | `{ category_id, bio (20–400 chars), years_experience?, service_radius_km? (1–50, default 15; migration 0062) }` |
| `PATCH /profiles/me/provider/availability` 🔒 (provider) | `{ is_available: boolean }` |
| `DELETE /profiles/me` 🔒 | self-serve account deletion → `204`, or `409 { blockers[] }` while the account still has a balance, a pending withdrawal, escrow held, an open dispute, or a live job. A **soft** delete: the row survives (the ledger, reviews and ML snapshots reference it) with every identifying field scrubbed, and the Auth user is renamed, banned and signed out (migration 0023, `BACKEND_SCHEMA.md` §27.1) |
| `GET /providers/:id` 🔒 | public provider card (bio, category, rating, completed jobs) |
| `GET /providers/:id/reviews` 🔒 | reviews for a provider |
| `GET /providers/:id/work` 🔒 | the provider's completed work |
| `GET /providers/me/portfolio` · `POST` · `PATCH/DELETE /providers/me/portfolio/:id` 🔒 (provider) | own portfolio items (migration 0044) |
| `GET /providers/:id/portfolio` 🔒 | a provider's public portfolio |
| `GET /skill-requests/me` · `POST /skill-requests` · `POST /skill-requests/:id/cancel` 🔒 (provider) | request to offer another service category; an admin approves or rejects it |
| `GET /geocoding/autocomplete` · `GET /geocoding/reverse` 🔒 | address suggestions (30/min) and reverse geocoding via Geoapify |
| `GET /categories` | Public list of active categories, `[{ id, name }]`, used by provider sign-up before login. Database errors return 400 rather than an empty list. |

**Jobs**

| Method & path | Description |
|---|---|
| `POST /jobs/price-estimate` 🔒 (client) | `{ category_id, urgency?, task_efforts?[] }` → `{ options: [{ tier, amount, min, max }] }` — three options (`basic`, `standard`, `premium`): category base price × checklist workload (heaviest task in full, each other at 60%; `light` 1, `moderate` 1.5, `heavy` 2.25) × urgency multiplier × tier factor (`basic` 0.85, `standard` 1, `premium` 1.25), rounded to ₱50 and capped at ₱100,000 (migration 0053). The mobile app currently maps flexible/normal/urgent to basic/standard/premium, so both factors apply to its one displayed price per urgency. |
| `POST /jobs` 🔒 (client) | `{ category_id, title (5–120), description (20–750), urgency?, address, address_details? (1–120), location_reference?, latitude?, longitude?, price_tier, scheduled_at?, photo_urls?, tasks?, task_efforts? }` — `address_details` is an optional house number, unit, floor, or landmark and does not change the map pin. A signed `location_reference` (1–4096 characters) saves the resolved point without geocoding the address again; invalid, expired, foreign-account, or mismatched references return 400. Without a reference the server uses the saved profile point when the address matches, otherwise geocodes `address`. Legacy client coordinates are accepted and validated when sent but never used to place the job. The server sets `budget` from `price_tier`; a client-sent `budget` is rejected. `scheduled_at` in the past is a 400; `tasks` is up to 20 checklist labels (≤120 chars each) stored as `job_tasks` with their effort (default `moderate`) |
| `GET /jobs?category_id=&limit=&offset=&latitude=&longitude=&radius_km=` 🔒 (provider) | browse `open`/`recommending` jobs, sorted by urgency then distance/newest; `latitude`+`longitude` (both required together) filter to `radius_km` (default 50km) of the provider; returns `{ jobs, summary: { open_count, urgent_count, potential_payout } }` |
| `GET /jobs/geocode?address=` 🔒 (client/provider) | typed address → `{ latitude, longitude, formatted_address, location_reference }` via Geoapify, Philippines only, street-level precision or better. The one-hour signed reference can be used when posting a job or accepting a booking. `400` when not found, too general (a barangay/city centre), or a low-confidence match; `503` when Geoapify fails or `GEOAPIFY_API_KEY` is unset. 10/min per IP. `BACKEND_SCHEMA.md` §31 |
| `GET /jobs/static-map?lat=&lon=` 🔒 (client) | `image/png` 600×300 map of a geocoded point, rendered by Geoapify server-side so the key never reaches the app. Coordinates must fall in the Philippines box (`400` otherwise); `503` when Geoapify fails or `GEOAPIFY_API_KEY` is unset. 20/min per IP. `BACKEND_SCHEMA.md` §31.1 |
| `GET /jobs/mine` 🔒 (client) | own jobs |
| `GET /jobs/assigned` 🔒 (provider) | jobs assigned to me |
| `GET /jobs/:id` 🔒 | job detail; for the job's client and assigned provider it includes `escrow: { status, funding_method } \| null` (null = no payment record yet). Every job read carries `dispute_state` and `display_status` (`disputed` while a dispute is open, otherwise `status`; migration 0063) |
| `POST /jobs/:id/cancel` 🔒 (client) | any pre-completion state → `cancelled` |
| `POST /jobs/:id/accept` 🔒 (provider) | `{ address?, latitude?, longitude?, location_reference? }` — accept an incoming booking request; `assigned` → `confirmed`, notifies the client (migration 0018). A signed location reference is preferred over client-supplied coordinates |
| `POST /jobs/:id/start` 🔒 (provider) | `assigned`/`confirmed` → `in_progress` |
| `POST /jobs/:id/decline` 🔒 (provider) | `{ reason (1–200) }` — assigned provider declines before starting; `assigned`/`confirmed` → `cancelled`, refunds escrow, notifies client |
| `PATCH /jobs/:id/tasks/:taskId` 🔒 (provider) | `{ is_done, proof_photo_paths? }` — assigned provider ticks a checklist item; allowed only while `in_progress`. Ticking done needs 1–4 proof photos uploaded to the `task-proof` bucket (migration 0059); un-ticking clears them. Returns the whole job; each task carries `proof_photo_urls` for both sides |
| `POST /jobs/:id/complete` 🔒 (client) | `in_progress` → `completed`; releases the payment to the provider at once unless a complaint is open (migration 0060) |
| `POST /jobs/:id/recommendations/trigger` 🔒 (client) | manually re-run the recommendation engine. A cold or rate-limited scorer is retried once; if still unavailable, returns `503` with “The matching service is waking up. Try again in a minute.” The attempt remains stamped for the scheduler retry. |

**Applications**

| Method & path | Description |
|---|---|
| `POST /jobs/:jobId/applications` 🔒 (provider) | `{ cover_message? (≤300) }` — one per job. `403 verification_required` without an approved identity, `403 certificate_required` without an approved, unexpired certificate for the job's service (0068), `403 payout_account_required` without a payout account; capacity limits answer `409` (0048) |
| `GET /jobs/:jobId/applications` 🔒 (client) | applicants for own job |
| `GET /applications/mine` 🔒 (provider) | my applications with job info |
| `POST /applications/:id/accept` 🔒 (client) | hire this provider — assigns the job, auto-rejects everyone else. Only for jobs without a price: a priced job answers `400 payment_required` and is hired by paying through `POST /payments/hire-checkout-session`, whose webhook accepts the application |
| `POST /applications/:id/reject` 🔒 (client) | decline |
| `POST /applications/:id/withdraw` 🔒 (provider) | retract a pending application |

**Reviews & notifications**

| Method & path | Description |
|---|---|
| `POST /jobs/:jobId/review` 🔒 (client) | `{ rating: 1–5, comment? (≤500) }` — once per completed job |
| `GET /notifications?unread=true` 🔒 | newest 50. Every row carries `target: { screen, job_id?, request_id? }` saying where a tap should lead (`job`, `dispute`, `payouts`, `verification`, `skill_requests`, `notifications`); push payloads carry it too |
| `GET /notifications/page?limit=&offset=` 🔒 | `{ items, total, unread_total }` |
| `GET /notifications/snapshot` · `GET /notifications/stream` 🔒 | one consistent `{ notifications, unreadCount }`; the stream is SSE, re-sent every 5 s when it changes |
| `GET /notifications/unread-count` 🔒 | `{ count }` — server-side count, not capped at 50 |
| `DELETE /notifications/:id` · `DELETE /notifications` 🔒 | dismiss one or all |
| `POST /notifications/:id/read` 🔒 | mark one read |
| `POST /notifications/read-all` 🔒 | mark all read |

**Payouts, Chat & Calendar** (🔒)

| Method & path | Description |
|---|---|
| ~~`/wallet/*`~~ | **Retired in migration 0056.** There is no user-facing wallet: see *Payments without a wallet* below |
| `GET /conversations/unread` 🔒 | `{ total, conversations: { [id]: count } }` — unread chat messages for the Messages tab badge; `GET /conversations` rows also carry `unread_count` (0061). Chat messages no longer create Notifications rows; the recipient gets a chat push on the Android `chat` channel, at most one per conversation per 60 s and none while they have that chat open |
| `GET /payouts/history` 🔒 | every payment in, payout and refund on the account, newest first (the ledger rows, read-only) |
| `GET /payouts/account` 🔒 (provider) | the linked payout account, masked: `{ method, bank_name, account_name, account_last4 }` or `null` |
| `PUT /payouts/account` 🔒 (provider) | `{ method: gcash\|maya\|bank, bank_code? (bank only, from `GET /payouts/banks`), account_name, account_number (6–20 digits) }` — also sends any payout that was waiting for an account |
| `DELETE /payouts/account` 🔒 (provider) | unlink |
| `GET /payouts/banks` 🔒 | banks a payout can go to, `[{ code, name }]` |
| `GET /conversations` 🔒 | caller's conversations (counterpart name + last-message time) |
| `POST /conversations` 🔒 | get-or-create for `{ job_id }` — job must have an assigned provider |
| `GET /conversations/:id/messages` 🔒 | messages, oldest first |
| `POST /conversations/:id/messages` 🔒 | send `{ body (1–1000)?, attachment_path? }` — at least one of the two is required. `attachment_path` must be a `chat-attachments` path from `POST /uploads/signed-url`, owned by the sender, and already uploaded as a non-empty image (400 otherwise) |
| `POST /conversations/:id/read` 🔒 | mark the other participant's messages read |
| `GET /conversations/:id/stream?since=` 🔒 | **SSE.** `message` events carrying a full message row, plus `ping` keep-alives. `since` = `created_at` of the newest message the client already has. Needs a client that sends an `Authorization` header — browser `EventSource` cannot |
| `GET /calendar/bookings?from=&to=` 🔒 | caller's bookings (provider or client side), with job + counterpart |
| `POST /calendar/bookings` 🔒 (provider) | `{ job_id, scheduled_at, duration_minutes?, notes? }` — schedule an assigned job |
| `PATCH /calendar/bookings/:id` 🔒 (provider) | `{ scheduled_at?, duration_minutes?, status?, notes? }` |

**Uploads** (🔒 — migration 0007/0008)

| Method & path | Description |
|---|---|
| `POST /uploads/signed-url` 🔒 | `{ bucket, content_type }` → `{ bucket, path, upload_url, token }`. Buckets: `job-photos`, `avatars`, `verification-docs`, `chat-attachments`, `provider-portfolio`, `provider-credentials`, `dispute-evidence`, `task-proof` |

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
| `GET /providers/me/credentials` 🔒 (provider) | own skill credentials (TESDA NC, PRC licence, trade certificate) with status `pending`/`approved`/`rejected`/`expired` and a signed document URL (migration 0054) |
| `POST /providers/me/credentials` 🔒 (provider) | `{ category_id, credential_type, title, issuer, credential_number?, issued_on?, expires_on?, document_path }` — photo uploaded first to the private `provider-credentials` bucket; at most 20; an already-expired one is a 400 |
| `DELETE /providers/me/credentials/:id` 🔒 (provider) | withdraw a credential that is not approved |
| `GET /providers/:id/credentials` 🔒 | approved, unexpired credentials only, without the document — the "Certified" badge per service |
| `POST /verifications/identity-session` 🔒 (provider) | starts a **Stripe Identity** session instead → `{ verification, session_id, ephemeral_key_secret, url, publishable_key }`. Documents go to Stripe and never reach this server; the result arrives by webhook, so poll `GET /verifications/me` |
| `GET /verifications/me` 🔒 (provider) | latest submission + status, plus `identity`, `certificate`, `verified` and `services: [{ category_id, name, primary, certificate }]` (0068). A provider with a `provider_profiles` row always has a primary entry in `services`, even before certificate approval. A profile/services lookup failure returns `500` instead of an empty unverified state. |

Two routes, one queue: a `manual` row carries document paths and waits for an
admin, a `stripe_identity` row carries none and is resolved by webhook. Only one
review may be open per provider, whichever route it came in by.

Approval flips `provider_profiles.is_verified`, and that flag is a **gate**,
not a badge (`BACKEND_SCHEMA.md` §17). An unverified provider can browse the
feed but:

- `POST /jobs/:jobId/applications` answers `403 { message: 'Verify your identity
  before applying to jobs', code: 'verification_required' }`;
- `POST /applications/:id/accept` answers `409 { code: 'provider_not_verified' }`
  before any money is held, in case an application outlives the verification
  it was filed under.

The `code` is what the app branches on to offer a way to verify. Since
migration 0026 no signed-in user can write `provider_profiles` directly, so
the flag can only be set by an approval or a Stripe Identity webhook.

**Disputes** (migration 0009)

| Method & path | Description |
|---|---|
| `POST /jobs/:jobId/disputes` 🔒 (client/provider) | `{ reason (1–200), details? (≤1000), photo_paths? (≤6, private `dispute-evidence` bucket, 0059) }` — participants can raise active/cancelled-job disputes; a held payment freezes until an admin decides, and settled payments stay settled (0041, 0060) |
| `GET /jobs/:jobId/disputes` 🔒 | the job's latest dispute (client or assigned provider), with `chat: { conversation_id, message_count }`; the whole job chat is part of the case |
| `POST /disputes/:id/entries` 🔒 (client/provider) | `{ kind: statement\|appeal, body, photo_paths? }`. `message_id` is deprecated |
| `POST /disputes/:id/cancellation-response` 🔒 (provider) | `{ accept, note }` on a client's cancellation |

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
| `POST /payments/xendit/webhook` | Xendit (test mode) invoice callback, verified by the `x-callback-token` header; a `PAID` invoice completes the hire or price change named by its `external_id` (`hire_<application>_…` / `pchg_<request>_…`) |
| `POST /payments/hire-checkout-session` 🔒 (client) | `{ application_id, app_redirect }` → `{ url, session_id, amount }`. **Pay-at-hire**: a Xendit test-mode invoice (GCash, Maya, GrabPay, card, online banking) when `XENDIT_SECRET_KEY` is set, otherwise Stripe card Checkout; amount is the proposal's `quote_amount`. The hire itself is made by the webhook (credit → hold → accept), not by this call. Same hireability checks as `POST /applications/:id/accept`; 400 `card_amount_out_of_range` outside ₱50–₱100,000. `BACKEND_SCHEMA.md` §29.4 |
| `GET /payments/hire-status?application_id=&invoice_id=` 🔒 (client) | Verifies proposal ownership, fetches the saved Xendit invoice from Xendit, and retries the idempotent hire application. Returns `application_status`, `payment_status`, and `invoice_id`; do not start another checkout while the server reports `confirming` or `needs_review` (migration 0077). |
| `GET /payments/return?status=&app_redirect=&flow=` | Where Stripe returns the browser. Redirects to the app deep link with `?hire=…` (or the price-change result). No JWT — it is a plain browser navigation that reveals and changes nothing |
| `POST /payments/price-change-checkout-session` 🔒 (client) | pay the difference for an approved price increase (migration 0057) |
| `POST /payments/xendit/payout-webhook` | Xendit payout callback, same token check as invoices: sets a provider payout `completed` or `failed` from Xendit's final result. Set it as the Payouts callback URL in the Xendit dashboard |
| `POST /payments/webhook` | Stripe only. No JWT — authenticated by the signature over the **raw** body |

**A hire is made by the payment webhook, never by the browser returning from
checkout.** The checkout calls only open the payment UI; a client that reported
its own success could get labour without paying.

For Xendit, each hire checkout is recorded in `xendit_hire_payments` (0077).
The webhook and `GET /payments/hire-status` both fetch the invoice from Xendit
before acting. A service-role-only claim RPC prevents overlapping processing;
stale claims can be retried after five minutes. Pending invoices are reconciled
every five minutes by the in-process cron or `/internal/tick/payments`, according
to the configured cron driver. The mobile app keeps the invoice id and does not
offer a new payment while the server reports `confirming` or `needs_review`.
This task adds the migration and code only; apply the migration and run a
Xendit sandbox end-to-end check before release.

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

**Provider payouts — Stripe Connect Express** (migrations 0027–0028, `BACKEND_SCHEMA.md` §29, setup in [`docs/stripe-setup.md`](../docs/stripe-setup.md) §6)

| Method & path | Description |
|---|---|
| `GET /payments/connect` 🔒 (provider) | `{ state: 'not_started' \| 'onboarding' \| 'restricted' \| 'active', details_submitted, payouts_enabled, transfers_active, requirements_due[], disabled_reason, country }`. The Stripe account id is never returned |
| `POST /payments/connect/onboarding-link` 🔒 (provider) | `{ app_redirect }` → `{ url, expires_at }`. Creates the provider's Express account on first use (transfers capability only), then a single-use Stripe onboarding link |
| `POST /payments/connect/sync` 🔒 (provider) | Re-reads the account from Stripe → the same status shape. The app calls it on returning from onboarding, since reaching `return` does not mean the form was finished |
| `POST /payments/connect/dashboard-link` 🔒 (provider) | `{ url }` — a one-time login to the provider's Stripe Express dashboard (bank details, payout history). 400 until onboarding has been submitted |
| `GET /payments/connect/return?app_redirect=` · `GET /payments/connect/refresh?app_redirect=` | Stripe's `return_url` / `refresh_url`. Redirect to the app with `?connect=return\|refresh`; allowlisted like `/payments/return` |
| `POST /payments/connect/webhook` | Stripe only, a **separate** endpoint with its own secret (`STRIPE_CONNECT_WEBHOOK_SECRET`). `account.updated` / `capability.updated` re-read the account and store what Stripe says now |

**Card-funded payouts** are sent on to the provider's Connect account automatically when the escrow
is released — a transfer sourced from the job's own charge, so Stripe's own FX rate applies
(`BACKEND_SCHEMA.md` §29.5). Everything else, and any transfer Stripe refuses, is paid to the
provider's linked payout account by the payments tick (see *Payments without a wallet*).

The three `POST` routes carry the payments rate limit. Connect is optional: without
`STRIPE_CONNECT_WEBHOOK_SECRET` the webhook answers 503 and statuses update only on sync.

| Env | Default | Meaning |
|---|---|---|
| `STRIPE_CONNECT_WEBHOOK_SECRET` | — | Signing secret of the Connect webhook endpoint |
| `STRIPE_CONNECT_COUNTRY` | `US` | Country for new Express accounts |
| `STRIPE_CONNECT_SERVICE_AGREEMENT` | `full` | `recipient` for cross-border accounts (e.g. PH on a US platform), once Stripe has enabled that |

**Admin** (🔒 admin role only — 401 without a token, 403 for non-admins)

| Method & path | Description |
|---|---|
| `GET /admin/users?search=&role=&status=&limit=&offset=` | search/filter users (`role`: client/provider/admin, `status`: active/suspended/**deleted**). Deleted accounts are excluded unless asked for, and never appear under `suspended` (migration 0023) |
| `GET /admin/users/:id` | single user detail (from `admin_user_overview`). Both user routes add `identity_verified` and `certificate_status` for providers (0074) |
| `POST /admin/users/:id/suspend` | `{ duration_days?, reason }` — refuses if already suspended or if the target is an admin. Omit `duration_days` for indefinite; otherwise the suspension lifts itself the next time `deactivated_at` is checked (login), no cron job |
| `POST /admin/users/:id/reinstate` | reactivate a suspended account |
| `POST /admin/users/:id/send-password-reset` | admin-triggered password reset email — refuses admin targets (migration 0014) |
| `GET /admin/bookings?search=&status=&category_id=&limit=&offset=` | platform-wide bookings view; search matches booking ID, client/provider name, service category, or job title; filtered status counts use the same search (migration 0038) |
| `GET /admin/bookings/:id` | one booking's full detail, plus its escrow record if one exists; stored `job-photos` paths are returned as public photo URLs |
| `POST /admin/bookings/:id/cancel` | force-cancel a booking — refuses if already `completed`/`cancelled`/`expired` |
| `GET /admin/analytics/summary` | totals (users/clients/providers/suspended/bookings/avg_rating/revenue/**commission**/`pending_verifications`/`pending_withdrawals`), bookings by status/category, daily booking trend, revenue trend, commission trend, top 10 providers by completed jobs (story #32). `total_revenue` is what flowed *through* the platform; `total_commission` is what it *kept* — see `BACKEND_SCHEMA.md` §27.5 |
| `GET /admin/activity?search=&limit=&offset=&from=&to=` | job-status transitions; search matches job title → `{ items, total }` (migration 0014 — was a bare array of the newest 20) |
| `GET /admin/audit?action=&actor_id=&from=&to=&limit=&offset=` | the admin action audit trail → `{ actions, total }` (migration 0014) — see below |
| `GET /admin/jobs/:jobId/conversation` | read-only view of a job's chat, oldest first, for dispute review (migration 0014) |
| `GET /admin/verifications?status=&limit=&offset=` | review queue; rows carry provider name, email, and short-lived signed document URLs |
| `GET /admin/skill-requests?search=&status=&limit=&offset=` | provider service-change queue; migration 0038 filters provider/category search before pagination and returns the matching total |
| `GET /admin/verification-cases` | one case per provider: ID photo, selfie and certificate together, with case type (new provider, certificate renewal, new service certificate) and history (0068) |
| `POST /admin/verification-cases/decision` | approve the case, or reject with the failed parts and a note; decision, audit and notification in one transaction; only pending submissions can be decided (0068) |
| `POST /admin/verifications/:id/approve` | approve → sets the identity half (`identity_verified`); `is_verified` then follows the certificate rule (0068) |
| `POST /admin/verifications/:id/reject` | `{ reason? }` |
| `GET /admin/credentials?status=&limit=&offset=` | credential review queue, `pending` by default, oldest first, with signed document URLs |
| `POST /admin/credentials/:id/approve` | approve a pending credential; audited, provider notified; a second decision is a 409 |
| `POST /admin/credentials/:id/reject` | `{ reason }` (1–500) |
| `GET /admin/transactions?search=&status=&limit=&offset=` | escrow records with both parties + service name; search matches transaction ID, client/provider name, or job title (story #17/#18) |
| `GET /admin/disputes?status=&limit=&offset=` | dispute queue |
| `POST /admin/disputes/:id/resolve` | `{ resolution: 'released_to_provider' \| 'refunded_to_client' \| 'reviewed', note }` (story #20) |
| `POST /admin/disputes/:id/clarification` · `POST /admin/disputes/:id/evidence-request` | `{ body, recipient?: client\|provider\|both }` (migration 0052) |
| `POST /admin/attachments/sign` | renew signed URLs for case photos and chat attachments |
| `GET /admin/queues/counts` | pending counts for the sidebar badges |
| `GET /admin/verifications/:id` | one verification submission |
| `POST /admin/skill-requests/:id/approve` · `/reject` | decide a provider's service-change request |
| `GET /admin/maintenance` · `PATCH /admin/maintenance` | maintenance mode (migration 0017) |
| `GET /admin/wallet-transactions` | the internal ledger (payments in, payouts, refunds) |
| `POST /admin/wallet-transactions/recovery-credit` | **Legacy (wallet era).** `{ profile_id, amount, title, job_id? }` — issues a trust credit after a dispute, tagged `kind: 'recovery_credit'` (migration 0021). **The only route that adds balance outside a settled Stripe charge or an escrow release**, which is why it is admin-only and audited; `POST /wallet/transactions` still refuses credits from everyone. Refuses a deleted recipient, a `job_id` they are not on, and anything over ₱50,000. See `BACKEND_SCHEMA.md` §28.1 |
| `POST /admin/escrow/:id/retry-transfer` | retries a card-funded payout's Stripe transfer that `failed`, was `abandoned`, or was `not_eligible` → `{ outcome }`. Audited (`escrow.retry_transfer`). A refused transfer is paid to the linked payout account instead (`BACKEND_SCHEMA.md` §29.5) |
| `GET /admin/withdrawals?status=&limit=&offset=` | **Legacy.** The manual settlement queue from 0024. Payouts are now sent automatically, so it only holds old rows |
| `POST /admin/withdrawals/:id/settle` | `{ reference }` — records that the money was actually sent. This is what debits the wallet; the balance is re-checked first and the row is only settled once, whoever clicks |
| `POST /admin/withdrawals/:id/reject` | `{ reason }` — the reason reaches the account holder and the amount returns to their available balance |
| `GET /admin/categories` | every service category, active or not (`GET /categories` still serves the apps only active ones) |
| `POST /admin/categories` | `{ name }` — 409 on a duplicate name |
| `PATCH /admin/categories/:id` | `{ name?, is_active? }`. **No delete** — jobs, provider profiles and the ML feature set all reference a category by id; `is_active: false` takes it off the menu without rewriting history |
| `GET /admin/admins` | who currently holds admin |
| `POST /admin/admins` | `{ email, full_name }` — creates or promotes an admin. **No password is accepted**; the new admin sets their own from the reset email this sends |
| `POST /admin/admins/:id/revoke` | demote to `client`. Refuses self-demotion and refuses to remove the last admin |
| `POST /admin/notifications/broadcast` | `{ title, body, audience: 'all' \| 'clients' \| 'providers' }` → `{ broadcast_id, sent, failed, audience, … }`; delivery status at `GET /admin/notifications/broadcasts/:id` (0052). One row per recipient (so read state and push both work); excludes admins, suspended and deleted accounts |
| `GET /admin/commission` | `{ commission_rate, updated_at, total_earned, earned_this_month, released_jobs, pending_estimate }`: the rate and what it has earned; `pending_estimate` is what held payments would yield at today's rate |
| `PATCH /admin/commission` | `{ commission_rate }` — a **fraction**, 0.15 being 15%, capped at 0.5. Applies to escrow released from now on; settled jobs keep their figures (migration 0024) |

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

There is no user wallet (migration 0056). A client pays for a hire at checkout
(`POST /payments/hire-checkout-session`: Xendit test mode when configured,
otherwise Stripe card Checkout). The payment webhook credits the payment,
places the `escrow_transactions` hold and accepts the application, all in one
step. When the client confirms completion, the payment is **released at once**
(migration 0060; there is no warranty hold, and early release was removed in
0064). The commission is withheld, and the rest is paid to the provider's
linked GCash/Maya/bank account by `pass_through_balances()` and the payments
tick (Xendit sandbox payouts, 0058). A failed payout is re-queued on the next
tick. An open complaint freezes the hold until an admin releases or refunds it.
`wallet_transactions` remains as the internal ledger these functions write to,
and no balance stays on it between jobs.

**Releasing raises rather than going quiet.** `EscrowService.release()` throws on
an escrow that does not exist or is no longer `held`; `releaseIfHeld()` — what the
job lifecycle calls — tolerates the two absences a normal completion legitimately
reaches it in (a job posted without a budget, and a disputed hold frozen for an
admin) and still raises on an already-released one. A silent no-op would let a
retried caller read success and believe a provider had been paid. §28.2.

**Hiring holds the money before it accepts the application.** The accept fires a
trigger that assigns the job and rejects every rival applicant, which application
code cannot reverse, so the webhook places the hold first. §28.3.

Every ledger row carries a `kind`, and **`kind = 'payout'` is the gross value
that flowed through the platform**. This matters: a payout and a refund are both
credits with a `job_id`, so the old `direction + job_id` rule would have counted
refunds as revenue. `kind` is derived server-side and never read from the request
body, so nobody can inflate the reported figure.

What the platform actually **keeps** is the commission: a fraction of the budget
withheld at release, frozen onto `escrow_transactions.commission_amount`. It has
no ledger row of its own, because `wallet_transactions` is keyed by profile and
the platform is not a profile. The rate defaults to 0, so nothing is withheld
until an admin sets one via `PATCH /admin/commission`. See `BACKEND_SCHEMA.md`
§18 — including the wallet locking rules — and
§27.5.

### Rate limiting

Enforced by a global `ThrottlerGuard` (`BACKEND_SCHEMA.md` §28.4). Over the
limit is a `429`.

**Every limit is per endpoint, per IP** — the throttler keys on handler + IP, so
each route counts separately and there is no aggregate cap across the API.

| Scope | Limit (per endpoint, per IP) |
|---|---|
| Everything | 240 / minute |
| `POST /payments/hire-checkout-session` | 5 / minute |
| `POST /auth/{register,login,admin/login,forgot-password,reset-password,send-email-otp,verify-email-otp,change-password}` | 10 / minute **each** |
| `POST /payments/connect/{onboarding-link,sync,dashboard-link}` | 5 / minute each |
| `GET /jobs/geocode` | 10 / minute — every call spends a Geoapify daily credit |
| `GET /jobs/static-map` | 20 / minute — every render spends Geoapify credits |
| `POST /payments/webhook`, `POST /payments/connect/webhook` | exempt — Stripe is authenticated by signature and retries for three days |

`POST /auth/refresh`, `GET /auth/me` and the admin session routes are
deliberately left on the 240 ceiling: they fire on ordinary app use, and a tight
limit there would sign people out rather than stop anything.

The 240 is a burst allowance, not a quota: a mobile screen that loads jobs,
wallet and an unread count on focus legitimately fires several requests at once.
The tight limits are the ones that matter — they stop the payment routes being a
free card-testing endpoint pointed at Stripe, and the auth routes being a
password-guessing or mail-relay surface. Neither stops a distributed attempt;
per-IP limiting cannot.

Storage is in-memory, so the limit is also **per process**. One Render instance
makes that the whole platform; a second would double every ceiling, and shared
storage (Redis) is the fix if it comes to that.

### Errors

Errors use NestJS's standard shape with proper status codes (400 validation,
401 bad/expired token, 403 wrong role/not owner, 404 not found):

```json
{ "statusCode": 400, "message": ["title must be longer than or equal to 5 characters"], "error": "Bad Request" }
```

### Example flow (curl)

```bash
API=https://taskbuddy-kpek.onrender.com   # or http://localhost:3000

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
- Jobs left in `recommending` with no run (ml-service failed, or nobody was
  eligible yet) are retried every 5 minutes until scored or expired.
- Feature vectors come from the `fn_job_provider_features(job_id)` SQL function —
  14 raw features per pair, names matching the ML training CSV exactly.
- **Eligible providers** are available, verified, have a bio, have profile
  coordinates (geocoded from their saved address), and are within their own
  `service_radius_km` of the job. A provider missing any of these is never
  invited (`BACKEND_SCHEMA.md` §32).
- Scoring is done by the trained **Random Forest `rf-a-v1`** in ml-service
  (`recommendation_runs.model_version` records which model produced each run).
- Every scored pair is snapshotted in `recommendation_candidates`; when the job
  closes, `was_hired` is backfilled, turning production data into retraining rows.
  Export query: see `BACKEND_SCHEMA.md` §13 — **exclude `model_version = 'stub-v0'`
  rows** (produced by the early placeholder scorer). Retraining/versioning guide:
  [`../ml-service/README.md`](../ml-service/README.md).

## Payments without a wallet

Migration 0056 retired the in-app wallet so the app never holds its own
currency. This is a prototype: no real money moves.

- **Payout results (PR #103):** a queued payout is claimed before it is sent,
  stays `pending` once Xendit accepts it, and becomes `completed` or `failed`
  from the payout callback or a reconciliation lookup on the payments tick.
  Only a definite refusal fails it; a timeout, 5xx or rate limit resends it
  under the same idempotent reference. Known gaps before real money (duplicate
  error handling, lookup envelope) are Phase 1 of the handoff plan.
- **In:** the client pays each hire on a Xendit test-mode invoice page (GCash,
  Maya, GrabPay, card or online banking). The webhook records the payment, holds it in
  escrow and accepts the proposal. `POST /applications/:id/accept` refuses a
  priced job with `payment_required`.
- **Out:** a release pays the provider's linked GCash/Maya/bank account
  through Xendit's sandbox Payouts API (migration 0058): `pass_through_balances()`
  queues a pending `withdrawal` debit, the API sends it (idempotent on the
  ledger row id) and records `XENDIT-<payout id>`, or marks it failed so the
  next payments tick retries. Without Xendit keys the payout is recorded with
  a simulated `SIM-…` reference instead. A refund goes back to the client's
  original payment method and is always simulated. This runs after every
  settlement and on each payments tick. A provider without a linked account
  keeps the payout pending until they link one.
- `GET /payouts/banks` lists the banks a payout can go to (Xendit channel
  codes; check new ones against Xendit's Philippine channel list).
- `wallet_transactions` remains the internal ledger the escrow functions write
  to; balances only exist between a settlement and its pass-through.
- **Release on completion (migration 0060):** there is no warranty hold. When the
  client confirms completion, `JobsService.complete` releases the payment at once
  (the payments tick retries if that attempt fails). Terms v3 state that a
  released payment is final and the platform is not liable after release.
- **Price changes (migration 0057):** a decrease is refunded to the client's
  payment method as soon as it is accepted. An accepted increase waits in
  `awaiting_payment` for up to 24 hours while the client pays the difference
  (`POST /payments/price-change-checkout-session`
  `{ change_request_id, app_redirect }`); the webhook then holds it and applies
  the new price. Unpaid, it expires and the price stays. A payment that arrives
  too late is refunded.
- Early payment release (0046, 0050) was removed: its routes are gone and
  migration 0064 disables the RPCs.
- Legacy and unused: the admin withdrawal queue and recovery credits. The web
  admin still shows them.

## Pending handoffs

- Physical-device checks of the post-UAT flows (pay at hire, completion
  release, payout account gate, notification routing) remain open.
- The ML service health check has been returning HTTP 429; investigate before
  relying on recommendations end to end.
- Android push delivery still needs Firebase credentials and a new native build.
  Admin verification emails need a verified sending domain and email API configuration.
- Xendit payouts run in sandbox mode only. A production launch needs live keys
  and a review of refunds, which are still simulated (0058).
- The web admin still shows wallet-era screens (withdrawal queue, warranty
  line, recovery credit) and does not show the new commission totals.
- Older handoff notes are in [`docs/backend-requests.md`](../docs/backend-requests.md)
  and `docs/backend-handoff-*.md`; check them against this README before acting.

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
    ├── chat/  calendar/         # conversations, unread counts, bookings
    ├── wallet/                  # internal ledger service (no routes since 0056)
    ├── payments/                # Xendit + Stripe checkout, webhooks, Connect
    ├── payouts/                 # linked payout account, banks, history
    ├── uploads/                 # signed Storage upload URLs
    ├── verifications/  credentials/  # identity and skill credentials
    ├── skill-requests/          # provider service-change requests
    ├── geocoding/               # Geoapify autocomplete / reverse
    ├── escrow/                  # escrow, disputes, payments scheduler
    ├── push/  settings/         # Expo push delivery, user settings
    ├── internal/                # cron-secret tick routes for an external driver
    ├── health/                  # status page and /health (with deployed commit)
    ├── common/                  # throttling, maintenance mode, sanitize helpers
    └── admin/                   # admin console: users, bookings, analytics,
                                 # queues, transactions, disputes, platform
```

## Scripts

```bash
npm ci              # clean install from package-lock.json (in sync since #104)
npm run start:dev   # dev server with watch
npm run start:prod  # run the compiled build (node dist/main)
npm run build       # compile
npm run lint        # eslint --fix
npm run format      # prettier
npm test            # jest unit + lifecycle specs (supabase-js mocked)
npm run test:sql    # the real migrations on real Postgres (PGlite, in-process)
```

`scripts/data-wipe.sql` is the pre-release data wipe: it keeps the schema,
migration history, configuration and admin accounts, and removes every other
account and all marketplace data (storage files are left for the dashboard).
It is destructive: run its first `SELECT` alone as a dry run, take a backup,
and run the rest only on the owner's go-ahead. `test/sql/data-wipe.test.mjs`
checks what it keeps.

`scripts/payout-audit.mjs` is a read-only check of payouts marked
`completed` before payout results came from Xendit: it looks each one up by
reference and lists any whose real status is not `SUCCEEDED`
(`node --env-file=.env scripts/payout-audit.mjs --since 2026-10-16`). It
refuses non-test Xendit keys and changes nothing.

A k6 load test for the money path (post → apply → accept/escrow hold → cancel/refund)
lives in [`load/`](./load/README.md). It is run by hand, not in CI, and **writes real rows**
to the API it targets.

`test:sql` applies every migration to PGlite (Postgres compiled to
WebAssembly — no server, no Docker) with the Supabase `auth`/`storage` schemas
stubbed, then exercises the money functions from 0028, the RLS lockdown from
0026, recommendation eligibility from 0032, and re-applying the latest migrations. The jest suites mock the
database and cannot see SQL at all; this is what does. `0025` is skipped — it
needs pg_cron, pg_net and Vault.

## History: October 4 test-document contracts

> Historical. The warranty, wallet and withdrawal parts below were superseded
> by migrations 0056, 0060 and 0064.

Apply reviewed migrations **0039–0045 in order** before the API/mobile release.
They add confirmed hiring, warranty settlement, participant complaints and
cancellation review/appeals, atomic service notices, approved-service guards,
private provider portfolio metadata/storage, and wallet debit reservations.
Never replay the entire migration folder against a live project without checking
its applied versions and repository history. These migrations passed local tests and a restored-target rehearsal, then were
applied and registered atomically on October 4. The matching Render API is live
at `68feb6f`; database/ML health and ten authenticated endpoint smoke checks
passed. Full deployed state-change/payment/device scenarios remain pending.

Portfolio ownership/read rules, signed location references, notification snapshot
consistency and admin dispute actions are specified in [BACKEND_SCHEMA.md](BACKEND_SCHEMA.md).
Withdrawal settlement requires a nonblank reference (1–500 characters). The
admin records an actual external payment; this endpoint does not send money.
Migration 0045 enforces debit affordability under the existing wallet advisory lock
for direct ledger inserts/updates as well as escrow/Connect RPC paths.

## Post-UAT backend contracts

Migrations 0046–0050 add early payment release (since removed by 0064), shared platform identity,
capacity limits, participant-approved job changes, and provider release requests.
They were merged into `upstream/main` by PR #81, and migrations 0051–0052 for
the remaining web admin contracts by PR #84. Migrations 0046–0052 are applied
to the linked Supabase project, and the matching API is deployed. The server now geocodes each posted job address and ignores client-supplied
coordinates; new passwords require 8–72 characters with a letter and digit,
while existing passwords remain valid for login. New provider signups require a
category and the three general consents.

| Route | Caller | Purpose |
|---|---|---|
| `GET/POST /jobs/:id/change-requests` | Participants | Read or propose schedule/price changes. |
| `POST /jobs/change-requests/:requestId/decide` | Other participant or proposer | Accept, decline or withdraw a request. |
| `GET /platform/identity` | Public | Read the shared name, support email and version. |
| `GET/PATCH /admin/platform-identity` | Admin | Read/update those fields with `expected_version`; stale writes return 409. |
| `GET/PATCH /admin/job-capacity` | Admin | Read/update active-job, pending-application and booking limits. |

Price changes happen before work starts; how they are paid is described under
*Payments without a wallet* (migration 0057). Request
expiry is reconciled on the five-minute payments tick and when requests are
read or acted on. Live API checks passed on 2026-10-16 ([evidence](../test-docs/DEPLOYED_POST_UAT_ACCEPTANCE_EVIDENCE.json));
the mobile UI for these contracts remains outstanding. `GET /jobs/:id` also
includes `escrow: { status, funding_method }` (or `null`) for the job's client
and assigned provider.

For a disposable receiving-ledger demonstration, run from repository root:

```sh
node backend/scripts/payout-demo.mjs
```

The simulator uses migrated PGlite and a local-only receiving schema; it neither
calls Stripe nor installs a production payout rail. [Evidence and limits](../test-docs/PAYOUT_VERIFICATION.md).
`npm test -- --runInBand`, `npm run test:sql`, `npm run build` and `npm run lint`
are the local gates. `npm run test:e2e -- --runInBand` currently exits with
“No tests found”; there are no configured end-to-end test files.

### Deployed QA evidence (October 4, 2026)

The existing sandbox API/Storage passed controlled portfolio upload/edit/private
viewing and ownership checks, plus text/photo notification and SSE snapshot
checks. See [portfolio evidence](../test-docs/DEPLOYED_PORTFOLIO_EVIDENCE.json)
and [chat evidence](../test-docs/DEPLOYED_CHAT_EVIDENCE.json). These API checks
do not establish native photo viewing or background push delivery.

Controlled service-request approval/rejection, replay notice counts, approved
secondary-service browse/apply/hire, nonempty job filters and account-bound
location save/reload also pass on the existing API. Evidence and the remaining
physical GPS/native gaps are in [release verification](../test-docs/RELEASE_VERIFICATION.md).

The dedicated sandbox provider also passes concurrent withdrawal reservation,
owner cancellation and replay checks, without external delivery. Both roles'
theme preferences persist independently in the deployed settings API. See
[withdrawal evidence](../test-docs/DEPLOYED_WITHDRAWAL_EVIDENCE.json) and
[settings evidence](../test-docs/DEPLOYED_THEME_SETTINGS_EVIDENCE.json).


### Target wallet concurrency verification (October 4, 2026)

[Independent target transactions](../test-docs/TARGET_CONCURRENCY_EVIDENCE.json)
confirm wallet lock overlap and rollback recovery on the deployed Supabase
database. Both QA debit inserts were rolled back and the wallet balance was
unchanged. [Concurrent API evidence](../test-docs/DEPLOYED_WITHDRAWAL_EVIDENCE.json)
separately covers reservation affordability, cancellation and replay. These
checks do not demonstrate external payout delivery.
