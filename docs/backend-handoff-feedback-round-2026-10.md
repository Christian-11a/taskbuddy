# Backend handoff: feedback round (October 2026)

For the backend owner. Read this instead of chasing links. Last updated: 2026-10-18 (PR #94 merged, PR #95 and #96 open).
The owner of this doc updates it when a branch is pushed, merged or deployed.

## 1. What is ready for you to review and deploy

| Branch / PR | Status | Migrations | Goes live with |
|---|---|---|---|
| `feedback/admin` (admin dashboard, PR #95) | PR open, ready to review and deploy | `0065` | Nothing else; independent |
| `feedback/mobile` round 1 (PR #94) | MERGED into `main` | `0064` | A new EAS preview build. Please confirm `0064` is applied and the API redeployed |
| `feedback/mobile` round 2 (PR #96) | PR open, ready to review and deploy | `0066`, `0067` | A new EAS preview build |
| `feedback/credentials-required` | In progress, not pushed | `0068` | The mobile certificate flow (C2, not started). Do NOT deploy before it |

### `feedback/admin`: deploy steps
1. Apply `0065_admin_bookings_disputed_filter.sql` on Supabase and record it in the migration history.
   It only replaces `admin_list_bookings` (status filter accepts `'disputed'`; same as `0038` otherwise).
2. Redeploy the API on Render. It also carries: credential list provider names fix, refusing approval of expired credentials.
3. The admin website goes live when the owner syncs the fork (Vercel).
Until step 2, the Bookings "Disputed" filter returns an error.

### Mobile: deploy steps
PR #94 (round 1) is merged: apply `0064_disable_early_release.sql` if not done yet (switches off the two early-release
functions; no data deleted). PR #96 (round 2):
1. Apply in number order and record each in the migration history:
   - `0066_complaints_before_completion.sql`: complaints only before the client confirms the job is done.
   - `0067_lock_commission_rate.sql`: the commission rate is stored when a job is hired and used at release
     SQL computes the fee from the locked rate and ignores the fee the API sends; released jobs show the stored fee.
2. Redeploy the API right away. The old API must not run long against `0067`.
3. New EAS preview build for testers (the old build expects the removed wallet and warranty).
Test data to clean up: one test complaint on the job "E2E 8.2 F-S82b start inflight".

### `feedback/credentials-required`: when it arrives
- Rule: a provider is verified only with identity approved AND an approved, unexpired certificate (TESDA, PRC or trade)
  for their service; each extra service also needs its own certificate.
- `0068` recomputes `is_verified` for every provider. Verified providers without a certificate become unverified
  (test accounts included). This cannot be undone easily: review carefully.
- Deploy order: `0068`, then the API immediately, then the admin website, together with the new mobile build that has the
  certificate step.

## 2. Tasks for you (nobody else is working on these)

1. **Xendit payout final status (most important).** `escrow.service.ts` `sendQueuedPayouts` marks a payout completed as
   soon as Xendit accepts the request. Handle Xendit's payout callback so the status becomes completed or failed from the
   real result, and the admin "Failed payouts" page and the provider's payout list follow it.
2. **Cleanup:**
   - 8 cancellation SQL tests fail on `main` (one: "tuple to be updated was already modified").
   - `backend/package-lock.json` is out of sync with `package.json` (`npm ci` fails).
   - 3 tsc errors in `jobs.service.spec.ts:239`, `profiles.service.spec.ts:247` and `:272`.
3. **Follow-ups:**
   - Admin users list: return `identity_verified` and certificate status, so the admin Users page can show exactly what a
     provider is missing (after `0068`).
   - Plan removing the deprecated `message_id` (complaints now attach the whole chat) once old app builds are gone.
   - Token refresh during an account switch can mix sessions (mobile `AuthContext`, rare): note only.

Payouts stay ONE account per provider (GCash, Maya or bank). No multiple payout accounts.

## 3. What we are still doing (avoid these areas or tell us first)

| Who | Branch / folder | Working on | Backend files touched |
|---|---|---|---|
| Mobile session | `feedback/mobile`, `taskbuddy-mobile` | Provider UI round 4 (screens, schedule change requests on the existing API, onboarding); becomes a later PR | none planned (uses existing endpoints) |
| Admin session | `feedback/credentials-required`, `taskbuddy-credentials` | Certificate rule fixes (C1) + one Verifications review page (C3) | `0068`, `verifications.service.ts`, `credentials.service.ts`, `profiles.service.ts`, `admin.controller.ts`, `payments.scheduler.ts` (expiry check), `provider_approved_categories` |
| Later | new mobile branch | Certificate step in Get verified (C2) | none (uses the C1 API) |

Rules so we do not collide:
- Start your branch from the team's latest `main`.
- Payout code is shared: `escrow.service.ts` and `payments.scheduler.ts` are touched by the fee-lock fix, the certificate
  expiry check and your payout-callback task. Keep your change in its own functions, and merge after the fee-lock fix if you
  touch the same function.
- Migration numbers taken: `0064`, `0065`, `0066`, `0067`, `0068`. Use `0069` or higher for new ones (tell us which).
- Never run `supabase db push` blindly (the remote migration history is out of sync); apply and record migrations the way
  earlier ones were.

## 4. Reviews already done
Independent reviews (Codex, GPT-6.1 Sol) were run on each branch and the findings fixed or listed above.
Full reports are kept by the owner (`docs/review-*-codex-2026-10-*.md` in the owner's local copy).
