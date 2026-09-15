# Backend Handoff — Post-SDK57 E2E Sweep Findings

Generated from a full user-story audit of the app (2026-09-15) against the 12
core TaskBuddy user stories. This file lists items that need backend work or
a backend-side decision, found while running the Maestro e2e sweep on
`chore/sdk57-e2e-doc-reconciliation`. Mobile-side status and bug history for
the same sweep lives in `mobile/maestro/bug-log.md`.

Each item below: what's wrong, why it's backend, and what "done" looks like.

---

## 1. Escrow hold isn't atomic on concurrent accepts

**Where:** `backend/src/escrow/escrow.service.ts`, `hold()` (~line 70–125).

**Problem:** The double-hold race for the *same job* is already handled
correctly — `escrow_transactions.job_id` is unique, so a duplicate accept
hits a `23505` conflict and reconciles against the existing hold rather than
double-debiting. The gap is across *different* jobs: a client with one wallet
balance can have two separate jobs accepted for them at nearly the same
instant. Each `hold()` call independently reads the balance via
`wallet.availableBalanceFor()`, both can pass the check before either debit
lands, and the wallet goes negative.

**Fix:** Serialize the balance-check-then-debit for a given client — either
a `SELECT ... FOR UPDATE` on a per-client lock row, or wrap the read+insert
in a serializable transaction and retry on conflict. Whatever approach is
used should keep `hold()`'s existing idempotency contract (`HoldResult.placed`
semantics documented on the interface) intact.

**Currently:** Accepted as a documented pre-launch risk, not fixed. Low
volume makes this unlikely to trigger today, but it's a real path to a
negative wallet balance once traffic exists.

---

## 2. Chat has no attachment support

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

## 4. Push notification delivery not functional

**Where:** `mobile/app.json`, EAS project config. **Note: this is an
infra/build-config task, not a NestJS code change** — flagging it here
per explicit request, but the actual work lives in the mobile build
pipeline, not `backend/src/`.

**Problem:** The backend push pipeline is code-complete — nothing to change
in `backend/src/push/push.service.ts` (Expo Push API integration, device
token upsert, dead-token pruning) or `backend/src/push/push.scheduler.ts`.
The blocker: `mobile/app.json` has no EAS `projectId`, so `expo-notifications`
never obtains a push token on-device, and nothing the backend does can reach
a token that doesn't exist. Additionally, remote push needs a real
development build — Expo Go does not support it on this SDK.

**Fix:**
1. `eas login` + `eas init` (or `eas build:configure`) from `mobile/` —
   requires an Expo account. This writes `expo.extra.eas.projectId` into
   `app.json`.
2. Confirm the existing dev-client build path (already used for native
   modules like Maps) picks up the new project ID.
3. Rebuild the dev client (`npx expo prebuild --clean && npx expo run:android`).
4. Verify a token is obtained and reaches the backend's device-registration
   endpoint, then trigger one real notification end-to-end (e.g. a job status
   change) as the actual acceptance test.

**Whoever picks this up needs an Expo/EAS account** — that's step 0 if one
doesn't already exist for this project.

---

## 5. "Booking requests" user story may not match the actual data model

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
