# Backend Handoff — Post-SDK57 E2E Sweep Findings

Generated from a full user-story audit of the app (2026-09-15) against the 12
core TaskBuddy user stories. This file lists items that need backend work or
a backend-side decision, found while running the Maestro e2e sweep on
`chore/sdk57-e2e-doc-reconciliation`. Mobile-side status and bug history for
the same sweep lives in `mobile/maestro/bug-log.md`.

Each item below: what's wrong, why it's backend, and what "done" looks like.

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

## 5. Chat attachments landed on `main`, but the deployed API hasn't picked it up

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
- No existence/validity check on a submitted `attachment_path` before it's
  persisted (unlike the verification-upload flow's `assertValidImage`) — a
  client could point a message at a path that doesn't exist.
- `SendMessageDto.attachment_path` (`backend/src/chat/dto/chat.dto.ts`) has no
  length/shape validation beyond `@IsString()`.
- `bubbleImage` (both chat screens) has no `resizeMode` and no tap-to-expand —
  non-4:3 photos get cropped.
- `handleSend` in both chat screens guards on its own `sending` flag but not
  on `attaching` — a fast double-tap could send text ahead of an in-flight
  photo upload. One-word fix (`|| attaching` in the early-return guard).
- `BACKEND_SCHEMA.md`'s table of contents doesn't list the new §30 section.

---

## 7. "Booking requests" user story may not match the actual data model

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

## Already working, no action needed

For context — these were audited in the same sweep and are solid:
escrow hold/release (core path), dispute filing + recovery credit wallet
entries, wallet balance/history display, job completion, ID+selfie
verification (Stripe Identity, genuinely automated), registration + consent
recording, login + role routing. Full detail in the sweep notes; ask if you
want the complete story-by-story audit.
