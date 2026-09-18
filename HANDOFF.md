# Backend Handoff — Post-SDK57 E2E Sweep Findings

Generated from a full user-story audit of the app (2026-09-15) against the 12
core TaskBuddy user stories. This file lists items that need backend work or
a backend-side decision, found while running the Maestro e2e sweep on
`chore/sdk57-e2e-doc-reconciliation`. Mobile-side status and bug history for
the same sweep lives in `mobile/maestro/bug-log.md`.

Each item below: what's wrong, why it's backend, and what "done" looks like.

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
| 9 | ml-service 429 | **Diagnosed**: the API's `ML_SERVICE_URL` points at the wrong host. Needs a Render env change. See §9 |

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

## 9. Deployed ml-service is returning HTTP 429 — recommendations failing in prod

> **Diagnosed, 2026-09-18: the API is calling the wrong host.** At the same moment:
> - The API's `GET /health` reported `ml_service: down, HTTP 429`, answered in ~100 ms.
> - The Render ml-service `https://taskbuddy-ml-service-8ppc.onrender.com/health` answered
>   **200** directly, with `model_loaded: true, model_version: rf-a-v1`.
>
> ml-service has no rate limiter of its own. So the 429 comes from whatever host the API's
> `ML_SERVICE_URL` names, most likely the old Hugging Face Space (`ml-service/SPACE_README.md`).
>
> **Fix (Render dashboard, API service → Environment):** set
> `ML_SERVICE_URL=https://taskbuddy-ml-service-8ppc.onrender.com` with no trailing slash, then
> redeploy. **Done looks like** `/health` → `ml_service: up`, and a test job gets scored.
>
> **Code hardening, in the working tree:** the `/score` call had no timeout, so a hung scorer held
> the recommendation scheduler's `running` flag and stalled every later tick. It now aborts after
> 75 s (enough for a cold start; the retry sweep picks the job up again). Failures now name the
> host (`Model service at https://… returned 429`), so a misrouted URL shows in the logs. The
> host isn't added to the public `/health` body.

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
