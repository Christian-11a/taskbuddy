# Backend handoff implementation plan — 2026-10-20

## Scope and source review

Reviewed the backend, mobile and web READMEs plus the current backend handoff
documents. The fetched `upstream/main` and `origin/main` refs both point to
`e13c10c2f8e1336965c5f19e3af06ce061244f36`; the implementation work is based
on that commit in an isolated worktree.

The current, actionable app handoffs are:

- Job location JL-1 through JL-5 and assigned-provider avatar data.
- The 2026-10-20 UAT findings, whose B1/B3 code fixes are already in this
  checkout; B2 was previously implemented. Deployment and device verification
  are separate from code completion.
- Xendit hire payment recovery, raised by the screenshot and confirmed by the
  current payment path: mobile polling only re-reads the application, while a
  paid callback can be acknowledged before durable recovery exists.
- Older phase-4 work and web-admin requests listed below, which are independent
  from the payment fix and have external or product dependencies.

## Implemented in this worktree

### 1. Location and job payload handoffs

- JL-1: reuse the caller's saved profile coordinates when the posted address
  matches that saved address.
- JL-2: extend signed location references to 60 minutes.
- JL-3: add optional `jobs.address_details` through migration 0076 and the job
  DTO/service.
- JL-4: return a signed location reference from `GET /jobs/geocode`.
- JL-5: allow providers to verify typed addresses and accept a signed start
  location reference.
- Include `avatar_url` in the assigned-provider job embed.

The code and local tests are in this worktree. Migration 0076 still needs to be
applied before deploying the API; no live database was changed.

### 2. Xendit payment recovery for the screen in the user report

The reported UI says payment was received but hire confirmation is still
pending. The existing app could only wait for the application row to change;
its manual status button did not query Xendit. The invoice webhook also needed
a durable record and recovery path when invoice verification or hire funding
failed.

Implemented in code:

1. Migration 0077 adds a service-role-only Xendit hire-invoice ledger and an
   atomic claim function. A stale processing claim can be retried after five
   minutes.
2. The invoice callback fetches the invoice from Xendit before acting. A
   processing fault returns an error so Xendit can retry; a verified invoice
   goes through the existing idempotent hire-funding path.
3. Authenticated clients can call `GET /payments/hire-status`. It checks
   proposal ownership, reconciles a known invoice from Xendit, and returns the
   proposal and payment states.
4. A five-minute worker and `/internal/tick/payments` reconcile invoices that
   have no successful callback. Pending or review-required attempts block a
   second checkout.
5. Mobile keeps the Xendit invoice id, uses the server status check on return,
   on manual refresh, and before offering another checkout. It continues to
   show the warning while the server still reports an unresolved invoice.

Migration 0077 and code still need a sandbox deployment and end-to-end payment
check. The screenshot does not prove whether that particular invoice was paid;
check its invoice id and Xendit status before taking any account-level action.

## Release order and acceptance checks

1. Review the migration diff and apply **0076, then 0077** to the target
   Supabase environment. Confirm migration history and database objects, then
   reload the PostgREST schema cache for 0076.
2. Deploy the matching API. Confirm `/health` reports its commit and the API
   can read/write `xendit_hire_payments` with the service role.
3. Ship the mobile build that sends `address_details` and retains the Xendit
   invoice id. Existing clients remain compatible with the additive payment
   status endpoint.
4. In Xendit test mode, run a paid hire and check that one invoice produces
   one ledger credit, one held escrow, and one accepted application. Repeat the
   callback and status check; neither may create another hold or hire.
5. Test a still-pending invoice, a failed/expired invoice, a stale processing
   claim, a mismatched paid invoice, a delayed callback, and a transient Xendit
   lookup failure. Confirm the client cannot start another checkout while the
   payment is pending or needs review, and that mismatched paid invoices create
   an admin alert.
6. Verify on Android that the screenshot's warning remains while the invoice
   is unresolved, then becomes “Hire confirmed” after the server confirms the
   hire. Do not infer production payment success from a browser return or the
   displayed warning.

The local SQL and service/controller/mobile tests cover the corresponding
contracts. A disposable Postgres with parallel connections is still needed to
prove real simultaneous callback/tick behavior; PGlite does not prove that
concurrency case.

## Remaining handoffs and dependencies

| Item | Next step | Dependency / boundary |
|---|---|---|
| UAT-B1 and UAT-B3 | Verify the existing verification and ML retry fixes on the deployed API, then repeat the provider UAT | Render deployment and physical-device check |
| UAT-B5 | Keep the `/verifications/me` primary-service response contract; remove the mobile fallback after the deployed fix is confirmed | Deployment confirmation |
| UAT-B6 urgency and price tier stacking | Confirm whether tier and urgency multipliers should stack before changing either client or server pricing | Product decision still open |
| Phase 3.1 real refunds | Replace simulated refunds with processor-specific refunds and idempotency, then verify each payment channel | Xendit/Stripe account access and refund test; no real-money actions in this work |
| Phase 4.3 stale verification cases | Include the current case in the 409 response and have the admin page render it | Backend and web change |
| Phase 4.4 concurrency suite | Run double webhook, tick/request and two-admin decisions against disposable Postgres using parallel connections | Test environment |
| Phase 4.5 deprecated `message_id` | Remove it in stages: mobile signature, API ignores while accepting old payloads, then DTO/RPC migration | Old mobile builds must age out before the final migration |
| Phase 4.6 account switch token refresh | Guard refresh results by current user id | Mobile-only work |
| Phase 4.7 data reset | Review dry-run counts, take a backup, then obtain explicit owner go-ahead before any wipe | Destructive and intentionally not run |
| Phase 4.8 flaky `HOHomeScreen` test | Await refresh or adjust the existing timeout and verify it | Mobile-only work |
| Web-admin verification email | Add idempotent email delivery that cannot fail verification submission | Sender domain/API and delivery test |
| Shared platform name/support email | Verify the existing backend admin settings contract is wired into web settings/footer; keep email empty until the mailbox is ready | Web integration and mailbox readiness |
| Open payment cancellation policy | Preserve the existing review/refund workflow until the product decision is confirmed | Product decision still open |

Older README and handoff entries about already-built APIs, migrations, Stripe
configuration, Firebase credentials, and manual test-account setup are not
reopened by this plan. Their deployment statuses need live verification only
when a release uses them.
