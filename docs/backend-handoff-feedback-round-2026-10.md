# Backend handoff: feedback round (October 2026)

For the backend owner. Read this instead of chasing links.
Last updated: 2026-10-18, after PRs #94, #95 and #96 were merged into `main`, with the backend owner's
progress on the tasks below (see *Backend status 2026-10-18*).
This file is updated through small docs PRs whenever something is merged, deployed or started.

## 1. Merged and waiting to be deployed

| PR | What | Migrations |
|---|---|---|
| #94 | Mobile round 1: complaints and disputed status, payout account before proposing, notification routing, early release removed | `0064` |
| #95 | Web admin: disputed filter, failed payouts, payment records, commission figures, credentials review, chat paging | `0065` |
| #96 | Mobile round 2: platform fee locked at hire and shown up front, provider Earnings, client Payments, review fixes, client UI | `0066`, `0067` |

### Deploy steps (in this order)
1. Apply on Supabase, in number order, and record each in the migration history (the way earlier ones were applied;
   never a blind `supabase db push`, the remote history is out of sync):
   - `0064_disable_early_release.sql`: switches off the two early-release functions. No data deleted.
   - `0065_admin_bookings_disputed_filter.sql`: `admin_list_bookings` accepts the `'disputed'` status filter. Nothing else
     changes.
   - `0066_complaints_before_completion.sql`: complaints can only be raised before the client confirms the job is done.
   - `0067_lock_commission_rate.sql`: the commission rate is stored when a job is hired and used at release. The database
     computes the fee from the stored rate and ignores the fee the API sends, so a rate change after hire never changes a
     payout. Held escrows are backfilled with the current rate.
2. Redeploy the API on Render right after the migrations (the old API should not run long against `0067`).
3. The admin website goes live when the owner syncs the fork (Vercel).
4. New EAS preview build for testers. The old build expects the removed wallet and warranty.

Until step 2: the admin Bookings "Disputed" filter returns an error. Until step 4: testers on the old build may hit errors.

Test data to clean up (or let the planned data wipe remove it): one test complaint on the job "E2E 8.2 F-S82b start inflight".

Please tell the owner when each step is done, so this file can say so.

### Backend status 2026-10-18
- **Render already runs `c6af502`** (the merged API) while `0065`–`0067` were not yet applied, the reverse of the
  order above. The API tolerates it (it reads `commission_rate` as optional), but until they are applied the
  Disputed filter errors, fees are not locked at hire, and the complaint cut-off is not enforced in the database.
  **Applied 2026-10-18 and verified** (Disputed filter, no post-completion complaints, `commission_rate` column and
  lock trigger; no held escrow left without a rate). Deploy steps 1 and 2 are done.
- `0064` is applied.
- **Hotfix `0069_defer_job_dispute_sync.sql` is applied to production** (by hand; the file is idempotent). `0063`'s
  trigger made every client cancellation of a hired job fail; `0069` defers it to commit. Verified with a
  rolled-back cancellation. This is also the fix for the 8 failing cancellation SQL tests below.
- Once the payout-callback PR is deployed: set the Xendit dashboard's **Payouts callback URL** to
  `https://taskbuddy-kpek.onrender.com/payments/xendit/payout-webhook` (same verification token as invoices).

## 2. Tasks for you (nobody else is working on these)

Status 2026-10-18 (backend owner):
- Task 1 (payout final status): **PR open**, branch `feat/xendit-payout-callback`. Payouts are claimed before
  sending, stay pending until Xendit's callback or a reconciliation lookup gives the final result, fail only on
  a definite refusal, and are resent under the same idempotent reference after a timeout. It also closes a
  double-payout risk. No migration. It changes `escrow.service.ts` `sendQueuedPayouts` only (plus new functions);
  `payments.scheduler.ts` is untouched. The web admin's payment-records marker now matches the in-flight note.
- Task 2 (cleanup): **PRs open.** SQL tests: `fix/dispute-state-deferred-trigger` (`0069`). Lockfile and the 3 tsc
  errors: `chore/backend-ci-cleanup`.
- Task 3: see the notes under each follow-up.


1. **Xendit payout final status (most important).** `escrow.service.ts` `sendQueuedPayouts` marks a payout completed as soon
   as Xendit accepts the request. Handle Xendit's payout callback so the status becomes completed or failed from the real
   result; the admin "Failed payouts" page and the provider's payout list then follow it.
2. **Cleanup:**
   - 8 cancellation SQL tests fail on `main` (one: "tuple to be updated was already modified").
   - `backend/package-lock.json` is out of sync with `package.json` (`npm ci` fails).
   - 3 tsc errors in `jobs.service.spec.ts:239`, `profiles.service.spec.ts:247` and `:272`.
3. **Follow-ups:**
   - Admin users list: return `identity_verified` and certificate status (after `0068`), so the admin Users page can show
     exactly what a provider is missing. *Waiting for the certificate PR (`0068`); not started, to avoid its files.*
   - Plan removing the deprecated `message_id` (complaints now attach the whole chat) once old app builds are gone.
     *Plan:* the current app never sends it (only the `addDisputeEntry`/`respondToCancellation` signatures in
     `mobile/src/lib/api.ts` still accept it). (1) Next mobile build: drop the parameter from those two signatures.
     (2) Once no tester runs a build older than that: the API ignores `message_id` (still accepted by the DTO so old
     builds do not get 400s) and stops passing `p_message_id`. (3) A release later: remove it from the DTOs and the
     two SQL function signatures in a migration. Keep the `dispute_entries.message_id` column and its read embed:
     past cases show the picked message as evidence.
   - Token refresh during an account switch can mix sessions (mobile `AuthContext`, rare): note only. *Recorded; no
     backend change needed. A client-side guard would drop a refresh result whose user id differs from the current
     session's.*

Payouts stay ONE account per provider (GCash, Maya or bank). No multiple payout accounts.

## 3. Still in progress (avoid these areas or tell us first)

| Work | Branch | Status | Backend files touched |
|---|---|---|---|
| Certificates required for verification (backend gate + one Verifications review page in the admin) | `feedback/credentials-required` | Being finished and reviewed; separate PR later | `0068`, `verifications.service.ts`, `credentials.service.ts`, `profiles.service.ts`, `admin.controller.ts`, `payments.scheduler.ts` (expiry check), `provider_approved_categories` |
| Mobile provider UI round (screens, schedule change requests on the existing API, onboarding and tour) | `feedback/mobile` (new commits) | In progress; separate PR later | none planned (uses existing endpoints) |
| Mobile certificate step in Get verified | not started | Starts after the certificate backend | none (uses the certificate API) |

### The certificate PR, when it arrives
- Rule: a provider is verified only with identity approved AND an approved, unexpired certificate (TESDA, PRC or trade)
  for their service; each extra service also needs its own certificate.
- `0068` recomputes `is_verified` for every provider. Verified providers without a certificate become unverified (test
  accounts included). This cannot be undone easily: review carefully.
- Deploy together with the mobile build that has the certificate step: `0068`, then the API immediately, then the admin
  website, then the new app build. Do NOT deploy it before the mobile certificate step exists.

### Rules so we do not collide
- Start your branch from the team's latest `main`.
- Payout code is shared: `escrow.service.ts` and `payments.scheduler.ts` are touched by the certificate expiry check and by
  your payout-callback task. Keep your change in its own functions.
- Migration numbers: `0064`–`0067` are in `main`; `0068` is reserved for the certificate PR. **`0069` is taken by the
  dispute-sync hotfix.** Use `0070` or higher for new ones and tell us which.

## 4. Reviews already done
Independent reviews (Codex, GPT-6.1 Sol) were run on each branch; the findings were fixed or are listed above.
