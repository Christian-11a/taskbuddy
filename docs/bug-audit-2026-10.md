# Code audit and fix plan — October 2026

Scope: backend (money path, auth/security, lifecycle/SQL), mobile, web.
Method: five read-only audits run in parallel, each finding required to name a
file:line and a concrete failure scenario. Items marked **verified** were
re-checked by hand (and, where possible, reproduced). Others are **plausible**
and must be reproduced with a failing test before they are fixed.

Baseline at audit time (`main` @ 977cbcb):

| Suite | Result |
|---|---|
| backend `npx jest` | 744/744 pass |
| backend `npm run test:sql` | **8 fail** (all cancellation paths, see C1) |
| backend `tsc --noEmit` | 3 errors in spec files (geocode mocks) |
| mobile `tsc` / `jest` | tsc clean; 4 failing tests in `HOHomeScreen.test.tsx` (timeouts) |
| web `tsc` / `lint` / `test` | clean; 629 pass, 1 skipped |

> "99.9% bug-free" cannot be measured directly. This plan turns it into gates
> that can be checked: zero known critical/high bugs, every fix landing with a
> regression test, all suites green in CI on every PR, and device/E2E checks of
> the money and auth flows before release (see *Quality gates*).

---

## P0 — fix now (production impact or account takeover)

### C1. Client cancellation of a hired job fails — **verified, reproduced, fix ready**
- Cause: migration 0063's `trg_disputes_sync_job_state` updates `jobs` while
  `review_work_cancellation` (a BEFORE UPDATE trigger on `jobs`, 0037/0041) is
  inserting the cancellation dispute. Postgres aborts the cancel with
  *"tuple to be updated was already modified by an operation triggered by the
  current command"*. 0063 is applied in production, so this is live.
- Fix: migration **0065** makes the sync a deferred constraint trigger (runs at
  commit), and also recomputes the old job if `job_id` changes. Branch
  `fix/dispute-state-deferred-trigger`; `test:sql` 139/139 plus a new
  `dispute_state` regression test.
- Deploy: apply 0065 to Supabase (no API change needed).
- Process gap: `npm run test:sql` was not run before 0063 shipped. See gates.

### C2. Google OAuth handoff fixation → account takeover — **verified**
- `GET /auth/google/authorize?handoff=` accepts a client-chosen id
  (`auth.controller.ts:154`), signs it into state as-is
  (`auth.service.ts:496-524`), and `storeHandoff` upserts the victim's session
  under it (`:546`). An attacker who sends a victim the link with their own
  id can claim the victim's tokens via `POST /auth/google/claim`.
- Fix: PKCE-style binding. The app sends `handoff_challenge = sha256(verifier)`
  at authorize; claim requires the `verifier`. Make the store insert-only.
  Keep a short compatibility window for old builds, then require it.
  Mobile must send the challenge/verifier.
- Tests: claim with the id but without the verifier is refused; second store
  with the same hash is refused.

### C3. Self sign-up as admin through Supabase Auth — **verified (trigger); exposure depends on project settings**
- `handle_new_user` (0016) casts `raw_user_meta_data->>'role'` to `user_role`
  unchecked, so `auth.signUp(..., { data: { role: 'admin' } })` with the public
  anon key creates an admin, who passes `/auth/admin/login`, every
  `@Roles('admin')` route, and `is_admin()` storage policies (ID documents).
- Fix (migration): accept only `client`/`provider`, otherwise `client`.
  Audit existing admins: `select id, email, created_at from profiles where role = 'admin'`.
  Consider disabling direct Supabase sign-ups since the API registers users.

### C4. Payouts can be sent twice — **verified (code path)**
- `sendQueuedPayouts` marks a row `failed` on *any* error, including a timeout
  after Xendit accepted it; `pass_through_balances` then re-queues with a new
  row id, which is a new idempotency key. Concurrent senders (tick +
  request-path `passThrough`) have no row claim either
  (`escrow.service.ts:202-262`, 0058).
- Fix: claim rows atomically (`pending` → `sending` with `UPDATE … RETURNING`);
  mark `failed` only on a definite 4xx; on unknown outcome keep the same
  reference and look the payout up by `reference_id` before retrying. Stop
  after N definite failures and alert.

---

## P1 — high (money correctness, data exposure)

| # | Finding | Where | Status | Fix |
|---|---|---|---|---|
| H1 | Refunds are never sent; users are told they were refunded | 0058 client branch (`SIM-` refs), `hire-funding.service.ts:383` | verified (by design note) | Call the Xendit refund API (Stripe `refunds.create` for card escrows), idempotent on ledger id; until then change the copy to "refund pending" |
| H2 | Disputes allowed for 72 h after completion, but money is already released | `0041 raise_job_dispute`, 0060 | verified | Block post-completion disputes (match Terms v3) or design a clawback; update mobile copy |
| H3 | A failed hire locks the job to that provider forever | `0028 escrow_place_hold` provider check before the `cancelled` check | verified | Allow re-hold of a `cancelled` row with a new provider and the current budget |
| H4 | Stripe-fallback card payouts never reach Connect (pass-through sweeps the credit first) | `escrow.service.ts:315-338`, `connect-payouts.service.ts:255` | plausible | Skip card-funded credits in `pass_through_balances`, or transfer before sweeping |
| H5 | Sweep between credit and hold can fail a paid hire | `hire-funding.service.ts:362/429`, payments tick | plausible | Credit + hold in one SQL function under `wallet_lock`, or skip fresh top-ups in the sweep |
| H6 | Price-change payment debits without lock/balance check | `0057 job_change_apply_payment` | verified (missing lock) | Take `wallet_lock`, raise TB402 when short, or merge credit+apply |
| H7 | Every authenticated user can read all profiles' phone/address/coords via PostgREST | `0003_rls.sql:20` (`using (true)`), `:60` | verified (policy) | Own-row select only, plus a narrow public view; restrict `jobs_provider_read` |
| H8 | `stripe_events` has no RLS and keeps default grants | `0013` | verified | Enable RLS, revoke from anon/authenticated |
| H9 | Web admin: reload after token expiry logs out (refresh sent without CSRF) | `web/src/lib/api/client.ts`, `session.ts` | plausible | Persist CSRF token in sessionStorage, or re-fetch it before refresh |
| H10 | Web admin: any 403 clears the session and breaks later actions | `client.ts:106` | plausible | Clear only on 401-after-refresh or the CSRF 403 |

## P2 — medium

| # | Finding | Where | Fix |
|---|---|---|---|
| M1 | Xendit paid invoices that can't be applied are acked and lost; no reconciliation | `payments.controller.ts:147`, `hire-funding.service.ts:316,480` | Record every paid invoice first, refund/flag unapplied, poll recent invoices |
| M2 | Xendit callback body trusted after token check | `xendit.service.ts:167-200` | Re-fetch invoice from Xendit before acting |
| M3 | OTP verify/reset limited only per IP per process | `auth.controller.ts:253-278` | Per-email attempt counter and lockout |
| M4 | Google identity linking onto unconfirmed password accounts | `config.toml:227`, `auth.service.ts:719` | Require email confirmation in production |
| M5 | `job-photos`, `avatars`, `chat-attachments` buckets lack MIME/size limits; job photos/avatars not validated | `uploads.service.ts:42`, 0007/0011/0030 | Bucket limits + `assertValidImage` |
| M6 | Upload ownership is a prefix check (`<me>/../<victim>/…`) | `uploads.service.ts:62` | Full-path regex |
| M7 | Push scheduler claim isn't conditional → duplicate pushes with 2+ instances | `push.scheduler.ts:~69-90` | `.is('pushed_at', null).select('id')` claim |
| M8 | Web shows warranty / "held until warranty ends" for released jobs | `WarrantyLine.tsx`, `TransactionsPage`, `DisputesPage` | Remove; drive from escrow status / `display_status` |
| M9 | Web wallet, withdrawals and recovery-credit flows no longer match the backend | `services/index.ts:684-731`, `WithdrawalsPage` | Retire or relabel |
| M10 | Web bulk approve/reject rejects after writes succeed | `services/index.ts:1143-1157` | Wrap refetch like `bulkSetUserStatus` |
| M11 | Mobile chat stream never reconnects; token captured once | `mobile/src/lib/api.ts` ~1647 | Error handler + backoff reconnect with fresh token and `since` |
| M12 | Mobile notification stream `JSON.parse` unguarded | `api.ts` ~1422 | try/catch |
| M13 | 0063 trigger ignored `job_id` changes | 0063 | Fixed in 0065 |

## P3 — low

- Web: commission totals and `display_status` not shown (`services/index.ts:760`); `/api/auth/login` 500s on bad JSON or missing session; CSP is report-only with no endpoint.
- Mobile: hire-payment polling continues after unmount (`HOJobApplicationsScreen.tsx:352`); unread polling runs in background (`useChatUnread.ts:46`); "returned to your wallet" copy (`jobDetailView.ts:327`); "Wallet" notification label (`notificationPresentation.ts:74`); 4 flaky `HOHomeScreen` tests.
- Backend: rejected payouts retry forever; blocked releases log a misleading error every tick; second payment for the same hire not refunded or announced; recommendations scheduler ignores the flip error; SSE streams never re-check suspension and are uncapped; OAuth state not bound to the browser (covered by C2); Host-header fallback when `PUBLIC_API_URL` unset; suspension not mirrored to Supabase Auth ban; arbitrary https avatars; `connect.controller.ts:170` raw `res.redirect` to `taskbuddy://`; 3 spec type errors.

---

## Execution order

1. **Today:** apply 0065 (C1). Run the admin-account query (C3) and confirm
   whether Supabase direct sign-up is enabled.
2. **Security sprint (C2, C3, H7, H8, M5, M6):** one PR per item; migrations
   for C3/H7/H8; mobile release for C2's verifier.
3. **Money sprint (C4, H1–H6, M1, M2):** start by writing failing SQL/PGlite
   tests for each race, then fix. Decide H2 (post-completion disputes) with
   the product owner first.
4. **Client sprint (H9, H10, M8–M12, P3 UI items):** web and mobile in
   parallel; they don't share files.
5. **Cleanup (remaining P3).**

Each item: branch `fix/<slug>`, failing test first, fix, full suites green,
PR to upstream with the test named in the description.

## Quality gates (what "99.9%" means here)

- **CI on every PR** (none exists today): backend `jest`, `test:sql`,
  `tsc --noEmit` (fix the 3 spec errors first), `lint`; mobile `tsc` + `jest`;
  web `tsc` + `lint` + `test` + `build`. Merges blocked on red.
- **Migrations:** every new migration ships with a PGlite test that exercises
  the triggers/functions it touches, and `test:sql` must pass. This alone would
  have caught C1.
- **Regression tests:** every fixed finding gets a test that fails before the
  fix.
- **Coverage targets:** ≥ 90% lines on `src/escrow`, `src/payments`,
  `src/payouts`, `src/auth`, `src/applications`; every SQL money function
  covered by `test:sql`.
- **Concurrency tests** for money: parallel webhook delivery, tick vs request
  path, double submit.
- **Release checklist:** device run of post-job → pay → complete → payout,
  cancel before/after start, dispute, Google sign-in; admin console smoke
  test; `/health` shows the new commit; migrations verified by object checks.
- **Production monitoring:** alert on payout failures, unapplied paid invoices,
  and 5xx rate; review weekly.
- **Re-audit** after the P0/P1 sprints, focused on the changed areas.
