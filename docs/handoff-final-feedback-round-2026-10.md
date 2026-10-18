# Final handoff: feedback round (October 2026)

For the backend owner. This is the final summary of the October feedback round from the mobile and admin side.
It is a new file on purpose: `docs/backend-handoff-feedback-round-2026-10.md` stays yours; this one does not edit it.
Written 2026-10-18, as part of PR #98.

## 1. What this round changed, PR by PR

| PR | State | What | Migrations |
|---|---|---|---|
| #94 | Merged | Mobile round 1: complaints with photos and the whole chat attached, Disputed status, payout account before proposing, notification routing by `target`, task checklist with proof photos, camera, radius 1–50 km, early release removed | `0064` |
| #95 | Merged | Web admin: Disputed filter and badge, Failed payouts (unresolved Xendit failures only), Payment records, commission headline and trend, credentials review, chat paging, released-payment revenue, wallet-era records hidden | `0065` |
| #96 | Merged | Mobile round 2: platform fee locked at hire and shown up front, provider Earnings, client Payments, review fixes (job screen resets on job change, stale price blocked, chat send errors, session kept after reset, 30 s request timeout), complaints only before completion | `0066`, `0067` |
| #97 | Merged | Your handoff doc refresh | none |
| #99 | Merged | Mobile round 4: provider UI (forms, Earnings, payout screen, task proof sheet, job detail), schedule change requests, onboarding and tour for both roles | none |
| **#98** | **This PR** | **Certificates required for verification**: backend gate, one Verifications review page in the admin, the certificate step in the app (C2) | `0068` |
| #100–#104 | Yours, open | Cancellation fix (`0069`), READMEs, your handoff status, Xendit payout results, lockfile and spec fixes | `0069` |

## 2. What #98 does

**Rule:** a provider may propose on, be invited to, or be hired for a job only with an approved identity check AND an
approved, unexpired certificate (TESDA National Certificate, PRC licence or trade certificate) for THAT job's service.
The main service and each extra service need their own certificate. `is_verified` stays the profile badge
(identity + certificate for the main service).

**Backend**
- `provider_profiles.identity_verified` holds the identity half; `is_verified` is recomputed from it and the main-service
  certificate (functions `refresh_provider_verified`, `refresh_all_providers_verified`, triggers on profiles and credentials).
- `provider_approved_categories` checks identity plus a valid certificate per category, live on the Manila date, so expiry
  takes effect even if the scheduled check runs late. Used by proposals, matching, assignment and the last check before money
  is held.
- Decisions run in one transaction through `decide_identity_verification`, `decide_credential` and
  `admin_decide_verification_case`: decision, audit row and notification together; only pending submissions can be decided;
  a decided submission is final.
- Old-API safety: an old-style `is_verified = true` write counts as an identity approval (unless the latest decided ID
  submission was rejected), then the certificate rule applies.
- Hiring: if the provider loses the qualification between the check and the escrow hold, the hold is released and the payment
  refunded in the same flow. Recommendations re-check eligibility right before each invite.
- Expiry: a reminder 30 days before a certificate expires; "Your certificate expired" only when an approved certificate
  actually passed its date (claimed once per certificate). Runs on the existing 5-minute payments tick
  (`credential_expiry_tick`).
- API: `GET /verifications/me` adds `identity`, `certificate`, `verified` and `services: [{ category_id, name, primary,
  certificate }]` (old fields kept). Errors: `verification_required`, `certificate_required` (403 on proposals),
  `provider_not_certified` (409 on hiring). Admin: `GET /admin/verification-cases`, `POST /admin/verification-cases/decision`.

**Admin website**
- Verifications is one case per provider: ID photo, selfie and certificate together; one approve, or reject with the failed
  parts ticked and a note (unticked parts are approved). Stripe-approved identity shows as such; the admin checks only the
  certificate. Case types: New provider, Certificate renewal, New service certificate. History tab (read-only, searchable).
  The separate Credentials tab is removed. Users page shows "Identity approved · certificate needed".
- Payment records show test-mode client refunds as "Refund recorded (test mode)".

**Mobile (C2)**
- Get verified is one flow: choose ID → ID photo → selfie → certificate for your service (TESDA guidance per service) → review
  and send.
- "You're verified" only when `verified` is true; otherwise "ID approved · certificate needed / under review / expired".
- Setup card and tour checklist: address, bio, identity, certificate, payout account.
- Per service: a provider with identity and a valid certificate for an extra service can propose on that service.
- `certificate_required` opens the upload for that service; clients see "This provider can't be hired for this service yet"
  for `provider_not_certified`. Expiry reminder, expired state and renewal upload. Help FAQ updated.

## 3. Deploy

**Already live (from your status notes and the app):** the API from merged `main` on Render; `0064`; your hotfix `0069`;
`0067` (platform fees show in the app). Please confirm `0065` and `0066` are applied and recorded too.

**#98, all together, in this order:**
1. Merge #98 (it is rebased on `main` after #99; your PRs #100–#104 can be rebased on top of it).
2. Apply `0068_credentials_required.sql` on Supabase and record it in the migration history (not a blind `db push`).
   It is safe to rerun. `0068` sorts before your `0069`, which is already applied; they change unrelated objects.
3. Deploy the API right after, so the old API does not run long against `0068`.
4. The owner syncs the fork, so the admin website goes live (Vercel). The new Verifications page needs step 3.
5. The owner makes a new EAS build with the certificate step.

**What happens when `0068` runs**
- Verified providers without an approved, unexpired certificate for their main service become unverified and cannot propose
  until they upload one and an admin approves it.
- Providers verified by hand (no approved ID submission) keep their identity; they still need a certificate.
- Extra services need their own certificate before the provider can propose on or be hired for them.

**After deploy, please check once with a real test provider:** Get verified with a certificate, admin approve, the provider
becomes verified, a proposal works; then a certificate-only reject shows "Verification needs changes". The new certificate
states were tested with mocks only, because the live API did not have #98's backend yet.

## 4. Open items for the backend (not in #98)

- **#103 payouts, before real money:** a lost reply plus retry gets Xendit's 400 `DUPLICATE_ERROR`, which is treated as a
  definite failure, so a second payout can be sent while the first succeeds; the payout lookup parses only a plain array
  (Xendit's SDK shows a `{ data: [...] }` envelope, worth checking against a real sandbox reply); payouts marked completed
  under the old rule before deploy are never reconciled. Smaller: `COMPLIANCE_REJECTED` stays pending, `REVERSED` only
  logs, the payout id is not matched on callbacks, reconciliation looks at 50 rows per run. After deploy, set the Xendit
  Payouts callback URL.
- **Your audit's P0 security items** (`docs/bug-audit-2026-10.md` in #100): Google OAuth handoff fixation, self sign-up as
  admin, and every signed-in user reading all profiles' phone and address (P1). These matter more than features before any
  real release.
- **Refunds are simulated in test mode** (`SIM-` references); real refunds per Xendit channel are needed before going live.
- **Data wipe before release:** wipe data only; keep tables, functions and the migration history. The test complaint on
  "E2E 8.2 F-S82b start inflight" goes with it.
- **Leftovers from the reviews:** Verifications case list paging (it loads all pending rows), stale-case handling beyond the
  409 reload, real concurrency tests (the in-memory SQL tests use one connection), the admin users list returning
  `identity_verified` and certificate status, removing the deprecated `message_id` on your plan, token refresh during an
  account switch (rare, client-side guard).
- **Known flaky test:** one timing-sensitive test in `mobile/.../HOHomeScreen.test.tsx`; passes alone.

## 5. Waiting on decisions (not code)

- **Price ranges:** today the client picks one of three fixed options (basic, standard, premium). The adviser asked for
  ranges; a stricter range model was proposed (range shown, proposals within it, one price change per job). The
  price-change screen waits on this.
- **Going live with real money:** Xendit live keys and account approval, real refunds, and the #103 fixes.

## 6. Not part of this round

- The public promo site (`/`, `/guide`) is updated later by the owner; it does not need backend changes.
