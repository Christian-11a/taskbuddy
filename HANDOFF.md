# Backend Handoff — Post-SDK57 E2E Sweep Findings

Generated from a full user-story audit of the app (2026-09-15) against the 12
core TaskBuddy user stories. This file lists items that need backend work or
a backend-side decision, found while running the Maestro e2e sweep on
`chore/sdk57-e2e-doc-reconciliation`. Mobile-side status and bug history for
the same sweep lives in `mobile/maestro/bug-log.md`.

Each item below: what's wrong, why it's backend, and what "done" looks like.

---

## Update 2026-10-02 — FullTest fixes (local, not deployed)

Implemented against `FullTest-Result.txt`, limited to bug fixes and blockers:

- Approved primary **and secondary** skills constrain browse, matching, applications and assignment. Primary changes are blocked during active jobs; secondary requests remain available.
- Every chat message creates a notification. Push delivery still depends on the existing push credentials and device registration.
- Task progress requires Start Job; completion requires all tasks done. The final task notifies the client for review.
- Cancelling work in progress preserves job/chat/task evidence and freezes held escrow for admin review. Participants can submit cancellation appeals; completed-job complaints have a seven-day window.
- Settled-payment disputes require an admin note and record a decision without moving money again. Any compensation uses the existing Issue Credit process separately.
- Wallet escrow totals now count held/disputed escrow independently of pending withdrawals. Mobile fixes cover job photos, hired-job offers, ongoing jobs, urgency filtering, form error scrolling, review thumbnails and responsive auth/privacy layouts. Inert dark-mode switches are disabled; no catalogue or theme feature was added.

**Release order:** migration 0037 was applied to the linked Supabase project on
2026-10-02 using the CLI SQL query command, then marked applied in migration
history. Read-only checks confirmed the reviewed resolution value, both new
RPCs and all nine triggers. Deploy the API next, then release mobile and web.
No API or app deployment was performed in this pass. The remote migration
history still contains dated copies of 0032–0034 and lacks numbered entries
0025–0036, although the checked schema objects and 0035 backfill state exist.
A normal `db push --dry-run` still fails until that history is reconciled; do
not blindly run the CLI-suggested repair or `--include-all`.

**Local verification:** backend 592 tests, SQL 68 tests, mobile 77 tests,
web 210 tests (one skipped). Backend/web builds, mobile typecheck and web
lint pass. Full backend lint retains 10 pre-existing errors in untouched
files listed in the September 29 entry. Mobile has no lint script.
Admin preview inspected at 390×844 and 1440×900; physical-device testing
remains outstanding.

**Live read-only checks (October 2, Asia/Manila):** the deployed API health
reported database up and ML down with HTTP 429. A direct ML health request
timed out after 45 seconds. Automatic recommendation delivery is therefore
not verified. Stripe webhook configuration, FCM credentials, earlier migration history
and deployed commit remain unverified; earlier handover diagnoses are not
fresh confirmation of their current state. The local debug APK predates the
test report, and no connected Android device was available, so the exact
tested build could not be established.

---

## Update 2026-10-01 — two new backend asks (one blocking)

### A. BLOCKER — Stripe webhook never succeeds, so wallet top-ups never credit

Card top-ups go through in Stripe, but no `payment_intent.succeeded` has reached `POST /payments/webhook`
with a 2xx since at least 2026-09-28. The most likely cause is that `STRIPE_WEBHOOK_SECRET` on Render isn't
the sandbox endpoint's signing secret. The same webhook completes card-at-hire and Stripe Identity results,
so both of those are broken too. **Needs Render + Stripe Dashboard access, and no code change.** Stripe only
retries for 3 days, so do the resend soon. Steps, the diagnosis table and how to verify:
[`docs/backend-handoff-stripe-webhook-secret.md`](docs/backend-handoff-stripe-webhook-secret.md).

### B. Deploy the verification/profile gate (committed on `main`, not yet on Render)

**The bug:** a provider who confirmed their email at signup never got a `provider_profiles` row, because the
old follow-up call needed a session they didn't have yet. An admin approval, or a Stripe Identity
"verified", then marked the review `approved` while `is_verified` had no row to land on. After that the
review couldn't be re-run. Details are in `BACKEND_SCHEMA.md` §17.

**What changed (`verifications.service.ts`, `profiles.service.ts`; no migration):**
- `POST /verifications`, `POST /verifications/identity-session`, and admin approve now return **409**
  while the provider has no `provider_profiles` row. The message tells them to finish Edit Profile.
- A Stripe Identity "verified" for such a provider is logged and left `pending`, so it stays in the admin
  queue. The webhook still returns 2xx, so Stripe stops retrying.
- `markVerified` now fails loudly on a 0-row update instead of reporting success.
- `PUT /profiles/me/provider` sets `is_verified = true` when it **creates** the row for a provider whose
  latest verification is already `approved`. This is the repair path. It never touches an existing row.

**To do:**
1. First confirm migrations **0035 and 0036** are applied (see Update 2026-09-29 below). `main`'s
   analytics and bookings code calls 0036's RPCs, so deploying `main` without them breaks those routes.
   Then deploy `main` to Render (`taskbuddy-kpek`) and check `GET /health`.
2. Run this read-only query in Supabase. It lists the providers who hit the 409 until they complete Edit Profile:
   ```sql
   select p.id, p.full_name, p.signup_category_id, v.status as latest_verification
   from profiles p
   left join provider_profiles pp on pp.profile_id = p.id
   left join lateral (
     select status from provider_verifications
     where provider_id = p.id order by submitted_at desc limit 1
   ) v on true
   where p.role = 'provider' and pp.profile_id is null;
   ```
   Rows with `latest_verification = 'approved'` repair themselves as soon as that provider saves Edit
   Profile. Tell the mobile dev how many rows there are. Don't hand-insert `provider_profiles` rows:
   `category_id` and `bio` are the provider's to choose.
3. **Before the next mobile build ships:** confirm the deployed `POST /auth/register` accepts
   `category_id` and `consented_*`. They're in `RegisterDto` since `c5f4bb4`, but deployment state
   isn't verified here. The app now sends them on register and no longer makes a follow-up call.
   Because of `forbidNonWhitelisted`, an API older than `c5f4bb4` would 400 **every** registration.

---

## Update 2026-09-29 — backend implementation pass (local, not deployed)

Pulled `upstream/main` at `170a288` and reviewed both app READMEs and the handoff
files. The following backend work is implemented locally:

| Request | Implementation / next step |
|---|---|
| Analytics and provider profiles fail after 0034 | Explicit `service_categories!category_id(name)` in analytics, `/auth/me`, and `/providers/:id`; database errors no longer masquerade as missing provider data. |
| Uploaded job photos do not render | All job response normalization converts stored paths to public `job-photos` URLs; legacy HTTP(S) URLs are preserved. |
| Urgency filter only covers 20 jobs | `GET /jobs?urgency=urgent\|normal\|flexible` filters in SQL before distance sorting/paging. Mobile still needs to send the selected chip value. |
| Wrong current password returns 401 | Now 400; expired/invalid bearer sessions still fail in the auth guard with 401. Google-only password UX remains a product decision. |
| Old accepted jobs missing calendar rows | Migration **0035** backfills confirmed/in-progress jobs only, preserves existing bookings and historical schedule/confirmation dates, and is repeatable. Not applied to production. |
| Service-request queue stops at 100 | `/admin/skill-requests?limit=20&offset=100` returns `{ items, total }`, with stable date/ID ordering. No pagination params preserves the legacy array for existing web builds. Web still needs to adopt the paginated contract. |
| Extra admin count requests | Migration **0036** supplies exact `escrow_held_total`, `escrow_held_count`, `open_jobs`, `matching_jobs` in analytics `totals`, and `status_counts` on admin bookings. Booking counts respect search/category but ignore page/selected status. |
| Audit and wallet search | `search` is accepted on both admin endpoints. SQL searches before paging/counting, including actor/profile names. Existing response envelopes are preserved. |

**Deploy order:** confirm migrations through 0034, apply 0035 then 0036, deploy
the backend, then verify authenticated analytics/provider/photo/filter requests.
0036 is required before deploying this API because bookings and analytics call
its RPCs. Unit/build/lint and local SQL tests are the verification here; no live
API, database, Render, Stripe or Firebase changes have been made in this pass.

**Validation (local):** `npm test -- --runInBand`: 45 suites / 577 tests pass;
`npm run test:sql`: 58 pass (including the new migrations); `npm run build`
passes. Changed TypeScript files pass ESLint. Full `npm run lint -- --no-fix`
reports 10 existing errors in untouched `auth/google-redirect.spec.ts`,
`auth/oauth-handoff.spec.ts`, `chat/chat.controller.ts`, `chat/chat.service.ts`,
and `geocoding/geocoding.service.ts`. `npm run test:e2e -- --runInBand` exits
with "No tests found"; there are no `.e2e-spec.ts` files. No device/browser or
live integration verification is claimed.

**Still external/approval-dependent:** Render Stripe version correction, verifying
Identity activation and the deployed hardening, existing deployment/migration
state, static-map/device checks, Firebase/FCM credentials and rebuild, Stripe
money-path smoke tests, production-writing load tests, and OTP configuration.
The Stripe hardening is already merged in the pulled main; no merge is needed.

**Still product decisions:** Google-only change/set-password behavior, provider
photo portfolios, secondary-category matching, where to display accept-time
location, server-backed admin preferences, wallet payout rail, and the story/UX
questions listed in the QA round 2 section below. Historical resolved handovers
are retained below as evidence, not new implementation requests.

---

## Update 2026-09-29 — BLOCKER: Render env var breaks provider verification

Get Verified step 3 fails with `Invalid Stripe API version: 2025-21-27`. The bad value is
`STRIPE_MOBILE_API_VERSION` **on Render** (it is in no commit), so this needs someone with Render access:
set it to `2025-01-27.acacia` or delete it. Card top-ups use the same variable and are probably failing too.
Full steps, plus a hardening branch to deploy: [`docs/backend-handoff-stripe-identity-config.md`](docs/backend-handoff-stripe-identity-config.md).

---

## Update 2026-09-24 (later) — mobile follow-up pass, no new backend asks

A follow-up pass picked up four items flagged as deferred in the QA round 2 note below —
declined-job visibility, a tutorial replay entry point, push-tap routing groundwork, and a
header-inset refactor across 29 screens. All four were mobile-only and are now done on
`fix/mobile-qa-round2` (full detail in `mobile/README.md`'s "Follow-up pass (2026-09-24)"
section). **This adds nothing to your list below** — no schema, endpoint, or deploy needed for any
of it.

One thing worth knowing if you're the one who eventually resolves §4 (Firebase/FCM): the mobile
push-tap routing (which screen a tapped notification opens) is already built and wired into
`App.tsx`. It's inert today because there's no token to receive a tap on, but once FCM lands and a
device gets a real token, it starts routing automatically — no mobile follow-up needed at that
point, nothing further to ask for here.

Two mobile-only manual verifications are still owed (not backend asks, just for visibility): a
real-device check of the header-inset refactor, and a dev-build check of the push-tap flow. Both
are things the mobile side can only close on real hardware, not something you need to act on.

---

## Update 2026-09-24 — QA round 2 backend asks

A second manual QA pass (`docs/manual_exploratory_test_documentation/`) was verified item-by-item
against the actual code, and everything mobile-only fixable was fixed on `fix/mobile-qa-round2`
(see `mobile/README.md`'s "QA round 2" note for the mobile-side list). What's left needs backend
work, a deploy, or a product decision.

### 0. BLOCKER — confirm PR #65's backend is deployed before shipping a mobile build

`main` already has mobile code that depends on backend work merged in PR #65: migration
`0034_qa_provider_admin.sql`, plus the API changes in `9897405` (verification `document_type`,
`AcceptJobDto` location, `/skill-requests*`, admin filters) and `b10c149` (image-signature MIME
fallback). The deployed API (`taskbuddy-kpek.onrender.com`) refused connections from this session's
network, so **whether this is live is unverified.** Against an older API:

- Provider verification submit 400s (`document_type` isn't whitelisted — `forbidNonWhitelisted`).
- `/skill-requests*` 404s.
- `GET /providers/:id/work` (client's "recent work" on a provider profile) silently shows nothing.
- The admin Verification column shows "Not submitted" for every provider.

**Deploy order:** migration `0034` → the API from `main` → only then a mobile build or `eas update`.
Check with `GET /health`.

### 1. One-time backfill: calendar bookings for jobs accepted before the accept-location change

Accepting a booking now always creates a `bookings` row (even for ASAP jobs), so the calendar shows
a dot. Jobs accepted **before** this change — especially ASAP ones — still have no booking row and
so no dot. Needs a one-time SQL backfill of `bookings` for `confirmed`/`in_progress` jobs that have
none. Not urgent; only affects historical data.

### 2. Urgency filter on the provider job feed doesn't actually filter server-side

`SPHomeScreen`'s Urgent/Normal/Flexible chips filter only the 20 jobs already loaded into memory
(`api.browseJobs({ limit: 20, ... })`), so "Normal" or "Flexible" can show nothing even when such
jobs exist further down the feed. Real fix: add an `urgency` param to `BrowseJobsQueryDto` and
filter in `jobs.service.ts`'s `browse`. A backend-free stopgap (raise the limit, or add paging) is
possible but doesn't scale.

### 3. Change Password: wrong-password response code, and no way to detect a Google-only account

Mobile now skips its own refresh-and-retry on a change-password 401 (fixed this round), but two
backend gaps remain:
- A wrong current password still returns generic `401 Unauthorized`. Returning `400`/`403` instead
  would let the client tell "wrong password" apart from "your session actually expired" without
  inspecting the message string.
- Google-only accounts have no password, so Change Password always fails for them with a confusing
  message. `GET /auth/me` (or a new field) needs to expose whether the account has a password / its
  auth provider, so the app can hide the option or offer "set a password" instead. Product decision
  on which.

### 4. Photo portfolio for providers doesn't exist

The client's "view provider profile like a portfolio" (QA item, client #8) shows `GET
/providers/:id/work` (title/service/date, added this round) but no photos — there's no portfolio
table, storage bucket, or endpoint, and `BACKEND_SCHEMA.md` §14 ("Out of Scope") explicitly lists
"Provider portfolios and certifications" as deliberately deferred. Needs a product decision before
any schema work.

### 5. Approved secondary-service requests don't affect matching

`skill-requests` (added in PR #65) lets a provider request a secondary service category, and an
admin can approve it, but nothing else reads the approved row — it doesn't affect the job feed or
the recommendation engine's eligibility. Needs a product decision: should an approved secondary
service actually let a provider see/match jobs in that category?

### 6. Provider's accept-time location is stored but never shown to anyone

`AcceptJobDto`'s `address`/`latitude`/`longitude` (PR #65) are saved when a provider accepts a
booking, so the client could in principle see the real distance the story asked for — but nothing
in mobile or web currently reads it back. Needs a decision on whether/where to surface it (job
detail? a map thumbnail?) before building the read side.

### 7. Admin: send the new filters to the backend instead of filtering client-side

`admin.dto.ts` already has `created_after`/`verification` query params (PR #65), but the web admin
Users page only sends `page`/`limit`/`status=deleted` and filters the "new users" and verification
columns over whatever page it already has (capped at 200 rows). Wiring the existing params through
`web/src/lib/services/index.ts` would make both filters correct past the first 200 users. Web-only,
optional.

### Product decisions raised by this pass (not backend work, but need an answer)

- What is **User Story 12**? Referenced in this file's own intro ("the 12 core TaskBuddy user
  stories") and in the original QA doc, but not defined anywhere in the repo, and the repo has two
  different, non-matching numbered story lists (this file's vs. `BACKEND_SCHEMA.md`'s "backlog
  stories").
- Should a job hired through a proposal skip the provider's own accept/decline confirmation step
  (currently every hire goes through `assigned` → provider confirms), i.e. was that intentional?
- Should the provider Edit Profile address stay required, given Accept Booking now asks for a
  current location separately? Job matching (recommendation features) uses the profile location, so
  dropping the requirement has a matching-side cost to weigh.
- Should "no scrolling on any screen" (original shared QA item #2) apply to long forms like sign-up,
  or only to screens meant to fit on one page?

---

## Update 2026-09-18 (later) — handoff pass

Where each item stands after a pass over this file, checked against the deployed API:

| § | Item | Status |
|---|---|---|
| 1, 2 | Escrow atomicity, chat attachments | Resolved (unchanged) |
| 3 | k6 load test | Script ready, **still not run**. Needs `k6` installed and a go-ahead to write test rows to prod |
| 4 | Push / FCM | **Open.** Needs Firebase Console access (unchanged) |
| 5 | Chat attachments on the deployed API | **Resolved.** Live smoke test passed 2026-09-18 |
| 6 | Chat polish punch list | Resize and send-guard done in `9ad2758`. Only the "Photo unavailable" placeholder is left |
| 7 | "Booking requests" story | **Stale.** The provider-side accept/decline flow exists. See §7 |
| 8 | Map thumbnail (B2) | **Built**: `GET /jobs/static-map` plus the mobile preview. Needs an API deploy |
| 9 | ml-service 429 | **Resolved** by restarting the ml-service on Render. Cause unknown; restart it if the 429 returns. See §9 |

Also confirmed live: `GEOAPIFY_API_KEY` is set on the API (`GET /jobs/geocode` returns 200), and
the hosted admin console's origin passes the API's credentialed CORS preflight.

## Update 2026-09-18 — mobile session (crash fix + new backend asks)

A mobile-side session cleared the last critical job-creation crash and cleaned up
the app config. What changed on the mobile end, and what it now needs from backend:

**Done on mobile, no backend action needed:**
- **BUG-004 (job-post crash) is fixed.** The create-job Location step used a native
  `react-native-maps` map that crashed on a missing Google Maps Android SDK key.
  That dependency is removed; the step now shows a keyless "Location confirmed"
  card built on the address the backend already geocodes (Geoapify). Full detail: **§8**.
- App config cleaned: duplicate Android permissions removed, expo patch versions
  realigned (`expo-doctor` 21/21), `expo-updates` + EAS `updates.url` kept and
  `eas.json` channels added so OTA is properly wired. **Note:** OTA only reaches a
  build made *after* this — one fresh `eas build` (development channel) is needed
  before `eas update` publishes will land on the installed client.

**New / updated backend asks:**
- **§8 (B2)** — optional map thumbnail: needs a backend endpoint returning a keyless
  Geoapify static-map URL (key stays server-side). Mobile UI is ready to consume it.
- **§9 (new)** — the deployed **ml-service is returning HTTP 429** (`/health` shows
  `ml_service: down`), so recommendation scoring is currently failing in prod.
- **Item 5** — deploy-drift: the live API's uptime is now newer than the chat fix,
  so this is *likely* resolved; still needs the signed-URL smoke test to confirm.
- **Item 3** — the k6 load-test script exists and just needs running + numbers recorded
  (needs Render/Supabase tier visibility).
- **Item 4** — push/Firebase is unchanged: still blocked on FCM credentials + a rebuild.

---

## 1. Escrow hold isn't atomic on concurrent accepts — RESOLVED on `main`

> **Fixed, 2026-09-16.** `EscrowService.hold()` (`backend/src/escrow/escrow.service.ts`)
> now delegates to a SQL function, `escrow_place_hold` (migration `0028`), which does
> the balance check and the debit inside one transaction behind a per-wallet advisory
> lock. The race described below — two different jobs for the same client landing
> concurrently, each reading the balance before either debit posts — is closed by the
> lock, not by anything client-side. See `BACKEND_SCHEMA.md` §29.2 for the full
> mechanism (it also now covers the wallet-hold and card-funded-hold paths in one
> function).

Kept below for the record — this is what the gap looked like before the fix.

**Where:** `backend/src/escrow/escrow.service.ts`, `hold()` (~line 70–125, pre-`0028`).

**Problem:** The double-hold race for the *same job* was already handled correctly —
`escrow_transactions.job_id` is unique, so a duplicate accept hit a `23505` conflict
and reconciled against the existing hold rather than double-debiting. The gap was
across *different* jobs: a client with one wallet balance could have two separate
jobs accepted for them at nearly the same instant. Each `hold()` call independently
read the balance via `wallet.availableBalanceFor()`, both could pass the check before
either debit landed, and the wallet could go negative.

---

## 2. Chat has no attachment support — RESOLVED on `chore/sdk57-e2e-doc-reconciliation`

> **Fixed, 2026-09-16.** `0030_chat_attachments.sql` added `messages.attachment_path` and the
> private `chat-attachments` Storage bucket; `chat.controller.ts`/`chat.service.ts` accept and
> return it through the same signed-URL upload flow every other attachment in this app uses
> (`POST /uploads/signed-url` → direct upload → submit the path). A follow-up migration,
> `0031_messages_body_or_attachment.sql`, was needed on top: 0030 never relaxed 0006's `messages`
> body CHECK, so every attachment-only send — the only kind the mobile attach flow produces — was
> rejected by Postgres until 0031 landed. See `BACKEND_SCHEMA.md` §30 for the full mechanism,
> including the chat-specific signed-URL TTL and the admin dispute-evidence view now including
> attachments too.

Kept below for the record — this is what the gap looked like before the fix.

**Where:** `backend/supabase/migrations/`, `backend/src/chat/`.

**Problem:** `messages` (added in `0006_wallet_chat_calendar.sql`) has only
`id`, `conversation_id`, `sender_id`, `body`, `read_at`, `created_at` — no
column for a file/image reference. The mobile chat screens
(`HOChatScreen.tsx` / `SPChatScreen.tsx`) already have an attachment button
in the UI, but it's inert because there's nothing on the wire to send.

**Fix:**
- New migration adding an attachment reference to `messages` (a nullable
  `attachment_path` text column following the existing upload convention is
  probably enough — see `uploads` module for how signed-URL paths are stored
  elsewhere, e.g. profile/verification photos).
- Extend `chat.controller.ts` / `chat.service.ts` to accept and return it.
- Reuse the existing `POST /uploads/signed-url` flow — the client uploads
  directly to Supabase Storage and submits the resulting object path, same
  pattern as every other upload in this app. Don't invent a new upload path.

**Mobile side:** I'll wire the button to call the existing signed-URL flow
and submit the path once the schema/endpoint exists — that part is ready to
go as soon as this lands.

---

## 3. No concurrent-load testing exists anywhere in the repo

> **Still not run, 2026-09-18.** `k6` isn't installed on the machine this pass ran on, and running
> the script writes jobs, holds and refunds to the production database. Both need an explicit
> go-ahead. Steps: `brew install k6`, then a short 1–2 VU run to confirm the client wallet covers
> the concurrent holds, then the default profile (`backend/load/README.md`).

> **Script added, not yet run, 2026-09-17.** `backend/load/money-path.js` is a k6 test of the money
> path: post job → apply → accept (escrow hold) → cancel (refund). It defaults to the deployed API
> and the maestro.* accounts, and **writes real rows** there. The recommendation cron is left out
> because it needs a 5–15 minute wait or a SQL nudge per job. How to run it and read the results:
> `backend/load/README.md`. What's still open is actually running it against the deploy and
> recording the numbers.

Kept below for the record — this is what the gap looked like before the script.

**Where:** N/A — nothing currently exists.

**Problem:** Confirmed via repo-wide search: no k6, artillery, autocannon,
locust, jmeter, or any script/file with "load" or "stress" in the name.
`backend/package.json` only has `build`/`start*`/`lint`/`format`/`test*`
scripts. Story 1 ("As the platform, I need to confirm it holds up under
concurrent load before real users depend on it") is entirely unaddressed.

**Fix:** Stand up a basic load test (k6 is a reasonable default) against the
deployed backend + ml-service, targeting the core money-path flow: job post
→ recommendation cron pickup → application accept → escrow hold. Needs
someone with visibility into the Render deploy tier and Supabase connection
limits, since the free tiers involved (Render cold starts, Supabase pooler
limits) will show up as false failures if not accounted for.

**Not started at all** — no existing scaffolding to build on.

---

## 4. Push notification delivery not functional — PARTIALLY DONE, blocked on Firebase

**Where:** `mobile/app.json`, EAS project config, and (new blocker) Firebase/FCM
credentials. **Note: this is an infra/build-config task, not a NestJS code
change** — the actual work lives in the mobile build pipeline and an external
Firebase project, not `backend/src/`. Assigned to whoever owns backend/infra —
the app owner does not have Firebase Console access.

**Problem:** The backend push pipeline is code-complete — nothing to change
in `backend/src/push/push.service.ts` (Expo Push API integration, device
token upsert, dead-token pruning) or `backend/src/push/push.scheduler.ts`.

**Done, 2026-09-16:** `eas init` ran; `mobile/app.json` now has a real
`extra.eas.projectId`. The dev client was rebuilt (`expo prebuild --clean` +
`expo run:android`, after fixing a JVM 8→17 Gradle mismatch by pointing
`JAVA_HOME` at Android Studio's bundled JDK) and confirmed running on an
emulator.

**Still blocking — Firebase (FCM):** on the rebuilt client, push registration
fails with `Unable to get Firebase Messaging instance. Did you configure
'googleServicesFile' path in app config?`. Since Expo SDK 49+, Android remote
push goes through Firebase Cloud Messaging under the hood — the EAS
`projectId` alone isn't enough.

**Fix, remaining:**
1. Firebase Console → create/pick a project → add an Android app with package
   name `com.taskbuddy.app` (matches `app.json`) → download `google-services.json`
   → place at `mobile/google-services.json`.
2. Add `"googleServicesFile": "./google-services.json"` under `expo.android`
   in `app.json`.
3. Upload that Firebase project's Server Key (or FCM V1 service account) to
   EAS credentials (`eas credentials` walks through this).
4. Rebuild the dev client, confirm a token is obtained and reaches the
   backend's device-registration endpoint, then trigger one real notification
   end-to-end (e.g. a job status change) as the acceptance test.

---

## 5. Chat attachments landed on `main`, but the deployed API hasn't picked it up — RESOLVED

> **Verified live, 2026-09-18.** Against `taskbuddy-kpek.onrender.com`, as the maestro.* accounts:
> `POST /uploads/signed-url` issued a `chat-attachments` URL. The PNG `PUT` returned 200.
> `POST /conversations/:id/messages` accepted an attachment-only message (empty `body`). The
> provider's `GET …/messages` returned a signed `attachment_url` that serves `200 image/png`.
> The deployed build is current. Test conversation: job
> `5f13ac3f-c909-4a39-b7f2-b750d218d553` ("E2E chat attachment verification job").

Kept below for the record.

**Where:** the Render deployment of `backend/`. **Assigned to whoever holds
Render access** — the app owner does not have it.

**Problem:** Item #2's fix (migrations `0030`/`0031`, `chat.service.ts`, the
`chat-attachments` bucket) is merged into `main` and the two migrations were
applied directly to the live Supabase database. But a live smoke test against
the deployed API (`taskbuddy-kpek.onrender.com`) on 2026-09-16 showed the
running process is still the *old* build: `POST /uploads/signed-url` rejects
`chat-attachments` as an unknown bucket, and `POST /conversations/:id/messages`
still enforces the old `body` (1–1000 chars) validation. The database is
current; the API process is not.

**Fix:** trigger a Render deploy of `main` (check whether auto-deploy-on-push
is enabled for this service first — if so, this may already be moot by the
time you read this; if not, deploy manually from the Render dashboard). Then
re-run the smoke test: log in as `maestro.client@taskbuddy.test` /
`maestro.provider@taskbuddy.test` (`TestPass123!`, both pre-seeded, funded,
and ID-verified — see `mobile/maestro/flows/00_setup_test_accounts.md`), open
a conversation on an assigned job, and send a photo end-to-end.

---

## 6. Minor polish items parked from the chat-attachments final review

Not blocking, not urgent — a punch list for whoever next touches this code,
found during the 2026-09-16 review but deliberately not fixed then:

- No placeholder ("Photo unavailable") when a signed attachment URL fails to
  resolve — the message bubble just renders empty.
- ~~No existence/validity check on a submitted `attachment_path` before it's
  persisted (unlike the verification-upload flow's `assertValidImage`) — a
  client could point a message at a path that doesn't exist.~~ **Done
  2026-09-17** — `ChatService.sendMessage` now calls `assertValidImage`.
- ~~`SendMessageDto.attachment_path` (`backend/src/chat/dto/chat.dto.ts`) has no
  length/shape validation beyond `@IsString()`.~~ **Done 2026-09-17** —
  `@MaxLength` plus a `@Matches` for the exact `<uuid>/<uuid>.<jpg|png|webp>`
  shape the upload endpoint issues.
- ~~`bubbleImage` (both chat screens) has no `resizeMode` and no tap-to-expand —
  non-4:3 photos get cropped.~~ **Cropping fixed in `9ad2758`** (`resizeMode="contain"`);
  tap-to-expand is still not built.
- ~~`handleSend` in both chat screens guards on its own `sending` flag but not
  on `attaching` — a fast double-tap could send text ahead of an in-flight
  photo upload.~~ **Done in `9ad2758`.**
- ~~`BACKEND_SCHEMA.md`'s table of contents doesn't list the new §30 section.~~
  **Done 2026-09-17.**

---

## 7. "Booking requests" user story may not match the actual data model — STALE

> **Out of date, 2026-09-18.** The description below predates migration 0018. The provider side
> *does* now receive and act on booking requests. Once a client hires, the job sits in `assigned`
> until the provider accepts (`POST /jobs/:id/accept` → `confirmed`) or declines it.
> `SPHomeScreen` lists these under "booking requests" with inline accept/decline
> (`mobile/README.md`, Screens). Story 9 is satisfied by that flow. The only thing left for product
> is whether the story's wording should say "hire requests" to match.

Kept below for the record.

**Where:** `backend/src/applications/` (accept/reject are `@Roles('client')`
only — no provider-facing "incoming request" concept exists).

**Problem:** Story 9 reads "As a service provider, I want to view and act on
incoming booking requests so I can manage my work." The app's actual model
is the reverse: providers *apply* to jobs (and can withdraw), and only the
*client* accepts or rejects. There's no endpoint or screen where a provider
receives a request and approves/declines it.

**This is a decision item, not a bug** — confirm with product whether the
story is satisfied by "provider applies, client hires" (in which case no
code changes needed, just re-wording the story) or whether a real
client-initiates-request-to-provider flow is wanted (a new feature).

---

## 8. Job-creation map crash (BUG-004) — fixed on mobile; thumbnail (B2) built

> **B2 built, 2026-09-18, in the working tree and not yet deployed.** `GET /jobs/static-map?lat=&lon=`
> (client only, 20/min) has the API render the Geoapify static map and return the PNG bytes. The
> key never leaves the server, and there's no keyed URL for the app to lift. Coordinates are
> bounded to a Philippines box. Details are in `backend/BACKEND_SCHEMA.md` §31.1.
> `HOCreateJobScreen` shows the image above "Location confirmed" via `api.staticMapSource()` and
> hides it on any error, so an API without the route behaves exactly as before. **To do:** deploy
> the API, then check on a device that the preview renders after an address verifies.

**Where:** `mobile/app/(homeowner)/screens/HOCreateJobScreen.tsx` (mobile, done);
a new backend geocoding/static-map route (the remaining, optional part).

**What was wrong:** the create-job Location step rendered a native
`react-native-maps` `MapView`, which needs `com.google.android.geo.API_KEY` in the
Android manifest (a Google Maps *Android SDK* key, billing-account-gated). No key
was ever configured, so advancing past service selection killed the process. Note
this is a *different* Google product from the geocoding API Eduard already moved to
Geoapify — that switch was backend-only and did not touch this map.

**Done, mobile side (2026-09-18):** `react-native-maps` removed entirely; the step
now shows a keyless "Location confirmed" card. No functionality lost — the map was
only a visual preview of coordinates the backend already resolves via
`GET`-geocode. `eas update` (OTA) could **not** have fixed this (native manifest
key), which is why the earlier "eas update resolved it" assumption was wrong.

**Remaining, optional (B2 — needs backend):** if a real map *image* is wanted back,
mobile will render a `<Image>` from a static-map URL. The catch: the Geoapify key
must stay server-side, so backend needs a small endpoint that returns a signed/
static Geoapify map URL (or a proxied image) for a given lat/long. Keyless on the
client. **Done looks like:** an endpoint mobile can call with resolved coordinates
that returns a ready-to-render static-map URL; no key ever ships in the app bundle.

---

## 9. Deployed ml-service was returning HTTP 429 — RESOLVED by a restart

> **Resolved, 2026-09-18, by restarting the ml-service on Render. The root cause is unknown.**
>
> **What was seen.** The API's `GET /health` reported `ml_service: down, HTTP 429` in ~100 ms. At
> the same moment, calling `https://taskbuddy-ml-service-8ppc.onrender.com/health` directly
> answered **200**, with `model_loaded: true`.
>
> **What fixed it.** An environment variable was added to the ml-service's Render service, and
> Render restarted it on save. The variable itself does nothing: ml-service reads only
> `MODEL_PATH` and `PORT`. Right after the restart, the API's `/health` reported
> `ml_service: up, model rf-a-v1`.
>
> **What it wasn't.** An earlier version of this section blamed a wrong `ML_SERVICE_URL` on the
> API. That was wrong. The API didn't restart (its `uptime_s` ran on through the fix), so its
> configuration never changed. It had been calling the right host all along. ml-service has no
> rate limiter in its code, so the 429 came from the running ml-service instance or Render's layer
> in front of it, and a restart cleared it.
>
> **Verified after the fix:**
> - `POST /score` directly: 200 in 4.2 s. A strong pair (same skill, 2 km, rating 4.8) scored
>   0.87 and a weak pair (other skill, 18 km, unavailable) scored 0.06.
> - The API's `/health`: `ml_service: up`.
> - Not run: the API's own pool → score → invite path on a real job, because it would post a
>   production job and notify real providers.
>
> **If the 429 comes back:** restart the ml-service from the Render dashboard, then read its logs
> around the first 429 for the trigger (free-tier limit, a burst from the retry sweep, or a
> platform limit). Jobs left unscored in the meantime are retried by the scheduler; nothing needs
> replaying by hand.
>
> **Code hardening, on `feat/geoapify-geocoding`:** the `/score` call had no timeout, so a hung
> scorer held the recommendation scheduler's `running` flag and stalled every later tick. It now
> aborts after 75 s (enough for a cold start; the retry sweep picks the job up again). Failures
> now name the host (`Model service at https://… returned 429`), so the logs show which server
> refused. The host isn't added to the public `/health` body.

Original report, kept for the record:

**Where:** the Render deployment of `ml-service/` (and/or the backend→ml-service call
path). **Assigned to whoever holds Render/ml-service access.**

**Problem:** a live check on 2026-09-18 (`GET /health` on the deployed backend)
reported `ml_service: {status: "down", detail: "HTTP 429"}`. A 429 means the
ml-service is rate-limiting (or something upstream of it is). While it's down,
jobs still reach `recommending` but scoring fails, so the top-8 invitations never
go out — the core matching feature is silently broken in production.

**Fix:** check the ml-service Render logs for the source of the 429 (free-tier
limit, a hot retry loop, or an upstream provider quota — note the recommendation
retry work in `4f2e8f7` claims unscored jobs in SQL, so confirm it isn't hammering
the scorer). **Done looks like:** `/health` shows `ml_service: up`, and a posted
test job gets scored and invites its top providers.

---

## Already working, no action needed

For context — these were audited in the same sweep and are solid:
escrow hold/release (core path), dispute filing + recovery credit wallet
entries, wallet balance/history display, job completion, ID+selfie
verification (Stripe Identity, genuinely automated), registration + consent
recording, login + role routing. Full detail in the sweep notes; ask if you
want the complete story-by-story audit.
