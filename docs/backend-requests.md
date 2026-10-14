# Backend requests from the mobile app

**Last updated: 2026-10-14.** Items 1 to 12 are the agreed requests from the mobile app. Items 9 to 12 are features: the app side will be built after the server side exists (the new screens stay behind an off switch until then).

For the teammate who owns the backend. The mobile app already blocks all of these in the UI, so normal users are protected.
Someone calling the API directly (curl, Postman, a modified app) can still skip the app's checks, so these are the server-side
counterparts. Items 1 to 8 are small DTO or service changes, and none is needed for the app to work. Found while auditing the mobile app's input validation.

Priority: do 1 to 3 first (money and trust), then the features in 9 to 12 as the team agrees; 4 to 8 if time allows.

## 1. Withdrawal amount has no minimum and no destination check (money)
- Where: `backend/src/wallet/dto/wallet.dto.ts` (`RequestWithdrawalDto`, about lines 25-38) and `wallet.service.ts` (about 123-127).
- App today: amount is at least 1 and at most the available balance; destination is checked by type (GCash/Maya = 09 + 9 digits, bank = 8-20 digits).
- Suggested: add `@Min(1)` next to `@IsPositive()` on `amount`; add `@Length(5, 200)` and a `@Matches` for digits/labels on `destination`.

## 2. Job coordinates are accepted from the client (trust)
- Where: `backend/src/jobs/jobs.service.ts` (about lines 107-109) and `jobs.dto.ts` (`CreateJobDto`).
- Problem: the client sends `latitude`/`longitude`; a modified client can place a job anywhere and skew matching. Profiles already avoid this
  (`UpdateProfileDto` takes a signed `location_reference` instead of coordinates).
- Suggested: do the same for jobs (geocode the address server-side, or accept a signed location reference), or at least re-geocode `address` and reject a large mismatch.

## 3. Job budget has no upper bound (money)
- Where: `backend/src/jobs/dto/jobs.dto.ts` (about lines 80-85).
- Problem: `@IsPositive` only; a huge value overflows the DB column, and card hiring only works up to 100,000 (the app caps at 100,000).
- Suggested: add `@Max(100000)` (or the agreed limit) and `@Min(1)`. Keep it in sync with `MAX_CARD_PHP` in `mobile/src/lib/cardLimits.ts`.

## 4. Password policy is only 8 characters
- Where: `backend/src/auth/dto/auth.dto.ts` (`MinLength(8)` on register, reset and change; about lines 19-21, 89-91, 108-110).
- Suggested: add `@MaxLength(72)` (bcrypt/Supabase truncation point) and `@Matches(/(?=.*[A-Za-z])(?=.*\d)/)` for a letter and a number.
- Note: apply only to new passwords (register, reset, change), never to login, so existing accounts keep working.

## 5. Consent and provider category are optional on the server
- Where: `auth.dto.ts` (about 45-58, 139-162) and `auth.service.ts` (about 142-147, 871).
- App today: terms, privacy and data consents are required in the UI; providers must pick a category.
- Suggested: make the three `consented_*` fields required (`@Equals(true)`) on register and Google completion, and require `category_id` when the role is provider.

## 6. Phone, name and address are only `@IsString`
- Where: `backend/src/profiles/dto/profiles.dto.ts` (about lines 14-33).
- App today: phone must be 09 + 9 digits (empty allowed), name 2-120 letters/spaces/`'`/`-`/`.`/`,`/`()`, address 5-200, city 2-80.
- Suggested: `@Matches(/^09\d{9}$/)` with `@ValidateIf` so empty is still allowed; `@Length` limits on `address` and `city`.

## 7. Delete account takes no password
- Where: `backend/src/profiles/profiles.controller.ts` (about lines 39-43).
- App today: the user must type the word DELETE, and the server's blocker checks still run first.
- Suggested (optional): require the current password in the request body, or a fresh sign-in token, before deleting.

## 8. Error messages
- The app now rewrites raw class-validator text into plain sentences, but clearer server messages (set `message:` on each decorator) would help every client.

## 9. Client "Release payment now" (early release of escrow) — feature request from UAT
- Ask: a client who is sure the work is done wants to release the held payment to the provider without waiting for the 72-hour warranty.
- Why the app alone cannot do it: releasing escrow is server-only. `EscrowService.release(jobId)` (`backend/src/escrow/escrow.service.ts`) is called ONLY by `payments.scheduler.ts` after `WARRANTY_DURATION_MS` (72 h). There is no client endpoint; the only other release path is the admin dispute resolution.
- Suggested change (small): `POST /jobs/:id/release` in `jobs.controller.ts` (next to `POST :id/complete`), client-owned jobs only, allowed when the job is `completed`, the escrow is `held`, and there is no open dispute; it calls `escrowService.release(jobId)` (the same path the scheduler uses, so the payout/commission/Stripe transfer logic is unchanged) and returns the updated escrow/job. Reject with a clear 400 message otherwise ("Payment already released", "A complaint is open", "The job is not complete yet").
- Mobile side (about one small worker): on the client's Job Details for a completed job inside the warranty, a "Release payment now" button with a centered confirm ("Release ₱X to {provider} now? You won't be able to file a payment complaint afterward."), calling the new endpoint, then refreshing the job/wallet; the existing "held until the warranty ends" card text updates.
- Product note: the warranty protects the client; releasing early gives up that complaint window, so the confirm must say so.
- Provider side (owner request): the provider can ask the client to release early. From a completed job (and from the chat) the provider taps "Request payment release"; the client gets a notification and a card in the chat ("{Provider} asked you to release PHP X") with "Release now" (same confirm as above, then the release endpoint) and "Not yet". Suggested server piece: `POST /jobs/:id/release-request` (provider-owned jobs only; job `completed`, escrow `held`, no open dispute; rate limit per job: at most 2 requests in any 12 hours, at least 2 hours between them, and about 6 in total (the scheduler releases it after 72 h anyway); the response says when the next request is allowed so the app can show "You can ask again in 1 h 40 m"; creates a notification for the client and a chat/system message). Reuses the chat card pattern from item 10.

## 10. Job change requests: date and time, and price (agreement between both sides) — feature request from UAT
- Ask: today a client and provider can agree in chat to move the date or change the price, but nothing in the app records it, so the job keeps the old values and disputes follow ("we agreed on 1,500, the app says 1,000"). Both sides should accept a change in the app before it takes effect.
- Why the app alone cannot do it: there is no way to edit a job's `scheduled_at` or `budget` after posting (no update-job endpoint, no change-request record), and a price change moves held money (escrow), which only the server can do.
- Design agreed with the owner:
  - Two separate request types. Date and time are one request (they always change together, low risk). Price is its own request (money).
  - Either party proposes from the chat ("Change details"), with a short reason. The other party sees a card in the chat with Accept and Decline. Nothing changes until it is accepted; a pending request expires after a set time (suggest 48 h) and can be withdrawn by the proposer.
  - Once accepted, the job is updated, both sides are notified, and the chat shows "Change agreed".
  - Price changes only before the job starts. A raised price needs the client's wallet to cover the difference first (hold it in escrow); a lowered price returns the difference. Respect the card limit (100,000) and the existing minimum.
  - No change while a dispute is open or the job is completed/cancelled.
- Suggested server pieces: a `job_change_requests` table (job_id, requested_by, type `schedule` | `price`, new_scheduled_at / new_budget, reason, status `pending` | `accepted` | `declined` | `expired` | `withdrawn`, timestamps); endpoints to create, list, accept, decline and withdraw; the accept step updates the job (and the escrow hold for price) in one transaction; notifications for propose, accept and decline; a scheduler tick for expiry.
- Mobile side (one worker once the API exists): "Change details" in the chat menu, a change-request card in the thread with Accept and Decline, a small proposal sheet (date and time picker, or an amount field using the existing amount rules), and the job details updating after acceptance.
- Related app-only work already planned: the Start job confirm warns when the booked date is far from today, so a very late or early start is never silent.

## 11. Limits on active jobs and double bookings — feature request from UAT
- Ask: keep both roles from taking on too much, and never double-book a provider. These are the numbers agreed with the owner; make them settings so they can change without an app release.
- Providers: at most 3 hired jobs active at once (hired, confirmed or in progress; a slot frees when a job is completed or cancelled), and at most 3 pending applications waiting. Clients: at most 3 open jobs at once (posted and not finished or cancelled). A fourth attempt is refused with a clear message ("You have 3 active jobs. Finish one to take another.").
- No overlapping bookings for a provider: a job needs a gap from the provider's other bookings of the earlier job's length + a 1 hour rest and meal buffer + travel time from the straight-line distance between the two job addresses (about 20 km/h in city traffic). Suggested default job lengths by service: Manicure and Pedicure 1 h, Plumbing 2 h, Handyman 3 h, Cleaning 4 h (a later improvement: let the client enter how long). Jobs with no set time ("as soon as possible") only count once they are hired and started.
- Daily cap: at most about 8 hours of booked work for one provider in one day (job lengths only).
- Where to check: when a provider applies, when a client hires, and on the job change requests of item 10 (a date change must not land on a conflict for either person; check again at the moment of acceptance). The server must enforce it, because the app can only warn.
- Needs a job duration (or the default per service above) to detect overlaps; the calendar module already lists a person's bookings by day.
- Mobile side (after the server enforces it): the app shows the reason and the earliest time that works, and warns before the server refuses.

## 12. Real push notifications with sound on Android (Firebase) — team request
- Ask: proper notifications on a real phone, with sound. The app already asks for permission, registers an Expo push token and creates a high-priority "Default" channel; the backend already sends through Expo's push service (`backend/src/push`).
- What is missing: Android delivery needs Firebase Cloud Messaging. `mobile/app.json` has no `android.googleServicesFile`, so a phone cannot get a push token (the dev client logs "Unable to get Firebase Messaging instance. Did you configure googleServicesFile path in app config?"), and no push reaches it.
- Steps: (1) create a Firebase project for the app and register the Android app with package `com.taskbuddy.app`; (2) download `google-services.json`; (3) add it to the project and set `android.googleServicesFile` in `mobile/app.json` (or store it as an EAS file secret); (4) upload the FCM credentials to Expo/EAS for the push service (see the Expo push notifications setup guide); (5) make a NEW build, because this is a native change and cannot be sent as an over-the-air update.
- Check afterwards on a real phone: permission prompt, a test push from the Expo push tool, sound and the heads-up banner, tapping a push opens the right screen, and the server's push for a new message, proposal and booking.
- Owner/teammate action: the Firebase and Expo accounts belong to the team; the app change is a few lines once the file exists.
