# Backend handoff: blockers found in the 2026-10-20 manual e2e test

Owner: **backend**. Written 2026-10-20 after a manual exploratory run of the core flow (provider verification, job
posting, Find providers) on a physical Android phone against the live API (`https://taskbuddy-kpek.onrender.com`,
`/health` commit `7cc773b`).

**The backend owner owns every item below. Nothing in `backend/` was changed on the mobile branch that carries this
file.** Mobile has shipped what it can (stopgaps and clearer messages, listed under "What mobile did meanwhile") but
three of the problems the tester hit cannot be fully fixed from the app.

Severity: **BLOCKER** stops the tester's flow, **HIGH** breaks a feature intermittently, **ASK** is a product or
contract question that needs an answer, not necessarily code, **INFO** was checked and needs nothing.

| ID | Severity | What | Done when | Status |
|---|---|---|---|---|
| UAT-B1 | BLOCKER | Deploy the `GET /verifications/me` fix | approved provider gets `identity: approved` | [ ] |
| UAT-B2 | BLOCKER | `POST /jobs` accepts the signed `location_reference` | a GPS address posts | [ ] |
| UAT-B3 | HIGH | Turn an ML 429/5xx/timeout into a clear 503, retry once | Find providers on a cold start answers or says why | [ ] |
| UAT-B4 | INFO | Notification wording was checked: already correct, no action | n/a | [x] |
| UAT-B5 | ASK | `services` contract of `/verifications/me` | confirmed | [ ] |
| UAT-B6 | ASK | Urgency multiplier stacking with price tiers | confirmed | [ ] |

## UAT-B1. BLOCKER: deploy the `/verifications/me` fix

*(tester items: "verified provider lands on Get verified, Start restarts step 1" and "verified provider cannot take jobs")*

The fix is **already written up and has never been deployed**. Do not re-derive it: read
[`backend-handoff-smoke-2026-10-19.md`](./backend-handoff-smoke-2026-10-19.md) section 1.

In short: `verificationState` in `backend/src/verifications/verifications.service.ts` (lines 420-426) embeds
`service_categories(name)` from `provider_profiles`. Migration 0034 added `provider_secondary_categories`, so PostgREST
now answers `PGRST201` (ambiguous relationship); the code ignores `error`, `pp` is null, and the endpoint reports
"nothing is verified". Two changes: qualify the embed (`service_categories!category_id(name)`) and throw on `error`
instead of swallowing it. Tests first, as listed in that document.

**State today:** live `/health` still reports commit `7cc773b` and `git log 7cc773b..origin/main -- backend` is empty,
so this is a code bug and a missing deploy, not drift.

**Done when**, for a provider whose ID and certificate an admin approved,
`GET /verifications/me` returns `{ "identity": "approved", "certificate": "approved", "verified": true, "services": [{ "category_id": 1, "name": "Plumbing", "primary": true, "certificate": "approved" }] }`
and, in the app, the verified provider's job detail shows an apply or payout action instead of "Verify first".

## UAT-B2. BLOCKER: `POST /jobs` refuses an address the app already resolved

*(tester item: "I submitted the job and got an error that the location address couldn't be matched, although I used the app's GPS location fetch"; the screenshot shows `We couldn't match that address exactly. Check the house number, street and city.` on the review step)*

**What happens.** The app resolves the address before the last step: "use my current location" calls
`GET /geocoding/reverse`, the dropdown calls `GET /geocoding/autocomplete`. Both return the point **and a signed
`location_reference`** (`geocoding.controller.ts`, `issueLocationReference`). The tester sees "Location confirmed".
At the last step the app posts the formatted address text plus `latitude`/`longitude`. `JobsService.create`
(`backend/src/jobs/jobs.service.ts:158`) ignores both coordinates and **geocodes the text again**
(`this.geocoding.geocode(dto.address)`). A reverse-geocoded string is often not a good forward-geocode query, so
`geocode()` rejects it with `confidence_street_level < 0.2` (`MIN_STREET_CONFIDENCE`) or "too general". The user is
told to fix an address the server itself produced, at the very end of a five-step form.

**Ask.** Do for jobs what `PATCH /profiles/me` already does:

1. Add an optional `location_reference` to `CreateJobDto` (same validators as `UpdateProfileDto.location_reference`:
   `@ValidateIf(... !== undefined) @IsString() @Length(1, 4096)`).
2. In `create`, when it is present, use `this.geocoding.resolveLocationReference(user.id, dto.location_reference, dto.address)`
   (the logic at `profiles.service.ts:81-100`) and take latitude/longitude/city from it; call `geocode()` only when no
   reference is sent.
3. Decide what to do with the required `latitude`/`longitude` fields on `CreateJobDto` (`@IsLatitude`/`@IsLongitude`,
   currently validated and then ignored): drop them or keep ignoring them, but say which.
4. Tests first: a valid reference skips `geocode()`; a tampered signature, another user's reference, an expired
   reference (15 minutes) and an address that differs from the signed `formatted_address` each return 400; no
   reference still uses `geocode()`.

**Mobile contract.** The app does **not** send `location_reference` on `POST /jobs` yet: the global validation pipe has
`forbidNonWhitelisted`, so an unknown field is a hard 400 for the whole post. Once this ships, tell the mobile owner and
a one-line follow-up starts sending it.

**Done when** a job posts from a GPS-fetched address that `geocode()` alone would refuse.

> **Status 2026-10-20:** done in `db24614b` (live in `1b25d454`). The app sends the reference from `fix/job-location-reference`.
> Follow-ups: `docs/backend-handoff-job-location-2026-10-20.md`.

## UAT-B3. HIGH: Find providers fails while the ML service is cold or rate-limited

*(tester item: "Find providers doesn't work", an error message)*

Observed twice on 2026-10-19/20: `GET /health` showed `ml_service: down, detail: HTTP 429` and, a few minutes later,
`up` (`model rf-a-v1`, latency 71 ms). The ML service runs on Render's free tier and sleeps; the wake-up window is
answered with 429/5xx. `POST /jobs/:id/recommendations/trigger` waits up to 75 s for it
(`ML_SCORE_TIMEOUT_MS`, `recommendations.service.ts:34`), and a non-2xx makes `callModelService` throw a plain
`Error`, which Nest turns into an opaque 500.

**Ask.**

1. In `callModelService` (`recommendations.service.ts:217`) treat 429, 502, 503, 504 and a timeout as "warming up":
   wait a few seconds and retry **once**, then throw `ServiceUnavailableException` with a message the app can show
   ("The matching service is waking up. Try again in a minute.").
2. Keep the job's `recommendation_attempted_at` stamp as is, so the scheduler's retry sweep still picks it up.
3. Decide whether the free-tier cold start is acceptable for UAT (a keep-alive ping or a paid instance is a hosting
   decision, not a code one).
4. Tests first: ML 429 then 200 -> succeeds; ML 429 twice -> 503 with the message; timeout -> 503.

**Also note for re-testing:** the candidate pool (`fn_job_provider_features`) only contains providers who are
`is_available`, have an approved certificate for the job's category (live rule, migration 0068), a geocoded address and
are inside their service radius. "No providers matched yet" is correct when none qualifies; test with a provider that
meets all of these.

**Done when** Find providers on a cold ML service either invites providers or returns a clear 503, never an opaque 500.

## UAT-B4. INFO: no action, the notification wording is already right

*(tester item: "provider got verified, the notification hit, I tapped it and landed on Get verified")*

Checked in `0068_credentials_required.sql` (lines 383-392 and 470-491): the decision notifications are already worded
by what was approved. "Verification approved" is sent only when `refresh_provider_verified` returns true; an ID-only
approval sends "ID verified" or "Upload your certificate to finish verification"; a certificate approval sends "You are
verified" only when verified. So the tester's provider really was fully verified (`is_verified = true`) when the
notification arrived, which makes UAT-B1 the whole explanation for landing on Get verified. Nothing to change; kept in
this list so the id numbering used elsewhere stays stable. (All of these notifications carry `data: {}`, so the app can
only route by type, to the Verification screen.)

## UAT-B5. ASK: contract of `services` in `/verifications/me`

Confirm that whenever a `provider_profiles` row exists the response includes the primary service in `services`
(`verificationState` already does this once UAT-B1 is deployed). The mobile stopgap (below) treats
`identity: "none"` with `services: []` as "the lookup failed" and falls back to the profile's flags; it becomes a
no-op after UAT-B1 and is deleted then. If `services: []` can legitimately mean something else, tell the mobile owner.

## UAT-B6. ASK: urgency multiplier and price tiers now stack

The tester asked for one price per urgency: Flexible = Basic, Normal = Standard, Urgent = Premium. Mobile now sends
exactly that `price_tier` (no server change needed). The server still multiplies by the urgency's
`price_multiplier` (`pricing.ts`, `priceOptions`) and then by the tier factor (basic 0.85, standard 1, premium 1.25), so
Urgent costs rate x 1.25 on top of the urgency multiplier and Flexible costs rate x 0.85. Confirm that this stacking is
intended, or say which single markup should apply (if the tier alone should carry the urgency, the multiplier would be
removed server-side and the app needs no change).

## What mobile did meanwhile (branch `fix/uat-blockers`)

- **Stopgap for UAT-B1** (`reconcileVerification`): when `/verifications/me` answers with exactly the broken shape
  (`identity: none`, `services: []`) and the signed-in profile says `is_verified` or `identity_verified`, the app trusts
  the profile. **Remove it after UAT-B1 is deployed** (one helper and four call sites; each handoff lists them).
- **For UAT-B2:** when posting fails with an address error, the app returns the user to the address step with the
  message and a hint to pick a suggestion, instead of leaving them stuck on the review step. It cannot make the post
  succeed.
- **For UAT-B3:** the Find providers request waits up to 90 s (it was 30 s) and says "Waking up the matching service".
- Mobile-only fixes, no backend work: availability switch persists, one price per urgency, Terms heading, Android
  navigation-bar spacing.

## Re-test after the deploy

1. As an approved provider: `GET /verifications/me` returns the object in UAT-B1.
2. In the app, as that provider: tap the verification notification -> "You're verified!" -> the button leads to
   Link payout account (or the feed when one is linked); a job's detail offers apply (or the payout step).
3. As a client: post a job from "Use my current location" without touching the address text -> it posts.
4. As the client, on a cold ML service: Find providers -> invites, or the 503 message from UAT-B3.
5. Delete the `reconcileVerification` stopgap in the app and repeat step 2.
