# Backend plan: closing the October feedback round handoffs

Owner: backend. Written 2026-10-18 after `main` reached `6ba5de2` (PRs #94–#104
merged). Sources:
[`handoff-final-feedback-round-2026-10.md`](./handoff-final-feedback-round-2026-10.md) §3–§5,
[`backend-handoff-feedback-round-2026-10.md`](./backend-handoff-feedback-round-2026-10.md) §2,
[`bug-audit-2026-10.md`](./bug-audit-2026-10.md), and the backend, mobile and
web READMEs. The READMEs' own backend asks are older (wallet, Stripe Connect,
Firebase) and are covered here or already closed.

## Where things stand

| Item | State (verified 2026-10-18) |
|---|---|
| Migrations 0064–0069 | Applied to production. 0068 checked: `identity_verified`, `admin_decide_verification_case`, `credential_expiry_tick` exist; 0069's trigger is deferred |
| Effect of 0068 | 0 providers verified, 46 identity-approved. Nobody can propose until certificates are uploaded and approved |
| API on Render | **Still `c6af502`** after `main` moved to `6ba5de2`. Auto-deploy did not pick it up; the certificate API (#98) and payout callback (#103) are not live |
| Admin website / app | Owner's Vercel sync and a new EAS build with the certificate step are pending |

## Phase 0 — make what is merged actually live (today)

> **Status 2026-10-18:** done. `main` did not compile (an autofix in #103
> dropped a type), which is why Render had stopped deploying; #106 fixed it.
> Render now deploys every merge; 0064–0069 verified. Still open: the Xendit
> Payouts callback URL in the dashboard, the owner's Vercel sync and EAS
> build, and a real-provider certificate smoke test.

1. **Deploy `6ba5de2` on Render.** Check the dashboard for a failed build or
   disabled auto-deploy; trigger a manual deploy. Done when `/health` reports
   `6ba5de2…`. Until then the admin Verifications page and the app's certificate
   step do not work against production, and 0068 runs under the old API.
2. **Set the Xendit Payouts callback URL** to
   `https://taskbuddy-kpek.onrender.com/payments/xendit/payout-webhook` (same
   verification token as invoices).
3. **Owner:** Vercel sync (admin website) and a new EAS preview build.
4. **Smoke test with a real test provider** (handoff §3): Get verified with a
   certificate → admin approves → provider is verified → a proposal works; then
   a certificate-only rejection shows "Verification needs changes". Also one
   sandbox payout end to end (callback received, row `completed`).
5. **Migration history:** confirm 0065–0068 are recorded; 0069 was applied by
   hand under its first number (recorded as `defer_job_dispute_sync` or not at
   all) — record it so the history matches the files.

## Phase 1 — payouts safe before any real money (#103 follow-ups)

> **Status:** done in #107 (deployed). All seven items; 1.3 is the read-only
> `scripts/payout-audit.mjs`. Not yet checked against a real sandbox reply.

Branch `fix/xendit-payout-hardening`. Failing test first for each.

| # | Problem | Fix |
|---|---|---|
| 1.1 | A lost reply then a retry can get Xendit's 400 `DUPLICATE_ERROR`; it counts as a definite failure, freeing the money while the first payout succeeds (double payout) | Treat `DUPLICATE_ERROR` (and any 4xx whose body names a duplicate) as *unknown*: look the payout up by reference and apply its real status |
| 1.2 | Payout lookup parses only a plain array | Accept both a plain array and a `{ data: [...] }` envelope; confirm against a real sandbox reply and keep a recorded fixture in the test |
| 1.3 | Payouts marked `completed` under the old rule (before #103 deployed) are never reconciled | One-off script: list completed `XENDIT-` payouts since 2026-10-16, look each up, report mismatches (no automatic change) |
| 1.4 | `COMPLIANCE_REJECTED` stays pending; `REVERSED` only logs | Map `COMPLIANCE_REJECTED` to failed; for `REVERSED` after completion, raise an admin alert notification and show it on Failed payouts |
| 1.5 | Callback payout id is not matched to the stored one | When the row already holds `XENDIT-<id>`, ignore a callback with a different id and log it |
| 1.6 | Reconciliation reads 50 rows per tick | Page through all in-flight/accepted rows, oldest first, with a per-tick cap on Xendit calls |
| 1.7 | A permanently refused payout is retried every tick | After 3 definite failures for the same account, stop queuing and alert the provider and admin until the account changes |

## Phase 2 — security P0/P1 (from the audit)

> **Status:** done and deployed. 2.2 in #108 (0070); 2.1 in #109 (0071,
> backend and mobile; old builds must update for Google sign-in); 2.3–2.5 in
> #110 (0072 and the full-path upload check). Production had one admin (the
> known account), so the sign-up hole was never used.

Each its own PR; migrations numbered from **0070**.

| # | Problem | Fix | Needs |
|---|---|---|---|
| 2.1 | Google OAuth handoff fixation: a client-chosen `handoff` id lets an attacker claim the victim's session | PKCE-style binding: app sends `sha256(verifier)` at authorize, claim requires the verifier; store insert-only; compatibility window for old builds | Mobile change (verifier) |
| 2.2 | Self sign-up as admin via `raw_user_meta_data.role` | Migration: trigger accepts only `client`/`provider`; audit existing admins; consider disabling direct Supabase sign-ups | — |
| 2.3 | Any signed-in user can read every profile's phone/address/coordinates through PostgREST | Migration: own-row select plus a narrow public view; restrict `jobs_provider_read` | Check no client reads Supabase directly (none do) |
| 2.4 | `stripe_events` has no RLS and default grants | Migration: enable RLS, revoke from anon/authenticated | — |
| 2.5 | Uploads: buckets without MIME/size limits; prefix-only path ownership | Bucket limits for `job-photos`, `avatars`, `chat-attachments`; full-path regex | — |

## Phase 3 — money correctness before going live

> **Status:** code parts done in #111 (0073, deployed): 3.2, 3.3, 3.5 (admin
> alert), 3.6, and refund wording for 3.1. 3.4 was already enforced by 0045's
> debit trigger; 0073 makes it explicit. **Open:** real refunds (3.1) need
> live Xendit access; a periodic invoice poll (rest of 3.5) once live.

| # | Problem | Fix |
|---|---|---|
| 3.1 | Refunds are simulated (`SIM-`); clients are told they were refunded | Xendit refund API per channel (Stripe `refunds.create` for card), idempotent on ledger id; until then app copy says "refund recorded (test mode)" (admin already does) |
| 3.2 | A failed hire locks the job to that provider (`escrow_place_hold`) | Allow re-hold of a `cancelled` row with another provider at the current budget |
| 3.3 | Sweep between payment credit and hold can fail a paid hire | Credit + hold in one SQL function under `wallet_lock` |
| 3.4 | Price-change payment debits without lock/balance check (0057) | `wallet_lock` + balance check in `job_change_apply_payment` |
| 3.5 | Paid invoices that can't be applied are acked and lost; no reconciliation | Record every paid invoice first; refund or flag unapplied ones; poll recent invoices |
| 3.6 | Xendit invoice callback body trusted after the token check | Re-fetch the invoice before acting |

## Phase 4 — handoff leftovers

> **Status:** #112 (0074, deployed): 4.1 done; 4.2 already paged; 4.5 step 1
> done (mobile); 4.7 script ready, **not run** (needs the owner's go-ahead and
> a backup). **Open:** 4.3 (admin console), 4.4 (needs real Postgres), 4.6
> (mobile), 4.8 (`HOHomeScreen` tests fail consistently on `main`, mobile).

| # | Item | Plan |
|---|---|---|
| 4.1 | Admin users list should return `identity_verified` and certificate status (now unblocked by 0068) | Extend `admin_user_overview` (migration) and the DTO; web shows "Identity approved · certificate needed" from it |
| 4.2 | Verifications case list loads all pending rows | Server paging (`limit`/`offset`/total) on `GET /admin/verification-cases` |
| 4.3 | Stale verification cases beyond the 409 reload | Return the current case in the 409 body so the admin sees what changed |
| 4.4 | Real concurrency tests (PGlite runs on one connection) | A small suite against a disposable Supabase branch or local Postgres with parallel connections: webhook double delivery, tick vs request path, two admins deciding |
| 4.5 | Remove deprecated `message_id` | Steps in `backend-handoff-feedback-round-2026-10.md` §2 (mobile signatures → API ignores → DTO and SQL removal) |
| 4.6 | Token refresh during an account switch | Client-side guard in mobile `AuthContext`; no backend change |
| 4.7 | Data wipe before release | Script that truncates data tables only (keeps schema, functions, migration history, categories, settings); dry-run counts first; run only on the owner's go-ahead |
| 4.8 | Flaky `HOHomeScreen` test (mobile) | Mobile team; raise the timeout or await the refresh |

## Waiting on decisions (not code)

- **Price ranges** (adviser request): fixed three tiers today; a range model was
  proposed. Backend work (estimate ranges, proposal bounds, one price change per
  job) starts once decided.
- **Going live with real money:** Xendit live keys and account approval, real
  refunds (3.1), and Phase 1 complete.

## Order and gates

Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4. Phases 1 and 2 can run in
parallel (different files). Migrations used: 0070–0074; the next is 0075. Every item: own branch, failing test first, backend
`jest` + `test:sql` + `tsc` green, migration with a PGlite test, PR with deploy
steps. Re-audit the money path after Phase 3.
